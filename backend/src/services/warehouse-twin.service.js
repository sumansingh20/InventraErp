'use strict';

const mongoose = require('mongoose');

/**
 * INVENTRA WAREHOUSE DIGITAL TWIN ENGINE
 * Provides 3D spatial hierarchy and mapping for advanced visualization.
 */

exports.getWarehouseTwin = async (warehouseId, companyId) => {
  const { Inventory } = require('../models/Inventory');
  const Warehouse = require('../models/Warehouse');
  
  const warehouse = await Warehouse.findOne({ _id: warehouseId, company: companyId }).lean();
  if (!warehouse) throw new Error('Warehouse not found');

  // We aggregate inventory to build the hierarchy: Zone -> Rack -> Shelf -> Bin
  // This constructs the full digital twin structure with fill levels.
  
  const inventoryNodes = await Inventory.find({ 
    company: companyId, 
    warehouse: warehouseId,
    quantity: { $gt: 0 }
  })
  .populate('zone', 'name code')
  .populate('rack', 'name code')
  .populate('shelf', 'name code')
  .populate('bin', 'name code')
  .populate('product', 'name sku unit')
  .lean();

  const zonesMap = new Map();

  for (const inv of inventoryNodes) {
    if (!inv.zone) continue;
    const zId = inv.zone._id.toString();
    if (!zonesMap.has(zId)) {
      zonesMap.set(zId, { id: zId, name: inv.zone.name, code: inv.zone.code, racks: new Map() });
    }
    const zone = zonesMap.get(zId);

    if (!inv.rack) continue;
    const rId = inv.rack._id.toString();
    if (!zone.racks.has(rId)) {
      zone.racks.set(rId, { id: rId, name: inv.rack.name, code: inv.rack.code, shelves: new Map() });
    }
    const rack = zone.racks.get(rId);

    if (!inv.shelf) continue;
    const sId = inv.shelf._id.toString();
    if (!rack.shelves.has(sId)) {
      rack.shelves.set(sId, { id: sId, name: inv.shelf.name, code: inv.shelf.code, bins: new Map(), products: [] });
    }
    const shelf = rack.shelves.get(sId);

    // If there are bins, map them, otherwise put products on shelf level
    if (inv.bin) {
      const bId = inv.bin._id.toString();
      if (!shelf.bins.has(bId)) {
        shelf.bins.set(bId, { id: bId, name: inv.bin.name, code: inv.bin.code, products: [] });
      }
      shelf.bins.get(bId).products.push({
        id: inv.product?._id,
        name: inv.product?.name,
        sku: inv.product?.sku,
        qty: inv.quantity,
        unit: inv.product?.unit
      });
    } else {
      shelf.products.push({
        id: inv.product?._id,
        name: inv.product?.name,
        sku: inv.product?.sku,
        qty: inv.quantity,
        unit: inv.product?.unit
      });
    }
  }

  // Convert Maps to Arrays and calculate fill percentages (heuristically based on item counts)
  const zones = Array.from(zonesMap.values()).map(z => {
    return {
      id: z.id,
      name: z.name,
      code: z.code,
      racks: Array.from(z.racks.values()).map(r => {
        const shelvesArray = Array.from(r.shelves.values()).map(s => {
          const binsArray = Array.from(s.bins.values());
          const totalProducts = s.products.length + binsArray.reduce((acc, b) => acc + b.products.length, 0);
          
          // Heuristic fill calculation (assuming 50 items = 100% full for demo purposes)
          const fillPercent = Math.min(100, Math.round((totalProducts / 5) * 100)) || Math.round(Math.random() * 80 + 10);
          
          return {
            id: s.id,
            name: s.name,
            code: s.code,
            fillPercent,
            bins: binsArray,
            products: s.products
          };
        });
        
        const rackFill = shelvesArray.length ? Math.round(shelvesArray.reduce((sum, sh) => sum + sh.fillPercent, 0) / shelvesArray.length) : 0;
        
        return {
          id: r.id,
          name: r.name,
          code: r.code,
          fillPercent: rackFill,
          shelves: shelvesArray
        };
      })
    };
  });

  return {
    warehouse: {
      id: warehouse._id,
      name: warehouse.name,
      city: warehouse.city
    },
    zones
  };
};

// ─── Heatmap Generation ────────────────────────────────────────────────────────
exports.getHeatmap = async (warehouseId, companyId) => {
  const { StockMovement } = require('../models/Inventory');
  const mongoose = require('mongoose');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Analyze stock movements in the last 30 days to see which zones/racks are "hot" (high movement)
  const heatmapData = await StockMovement.aggregate([
    {
      $match: {
        company: new mongoose.Types.ObjectId(companyId),
        warehouse: new mongoose.Types.ObjectId(warehouseId),
        createdAt: { $gte: thirtyDaysAgo }
      }
    },
    {
      $group: {
        _id: { zone: '$zone', rack: '$rack' },
        movementCount: { $sum: 1 },
        totalQuantityMoved: { $sum: '$quantity' }
      }
    },
    {
      $lookup: { from: 'zones', localField: '_id.zone', foreignField: '_id', as: 'zoneInfo' }
    },
    {
      $lookup: { from: 'racks', localField: '_id.rack', foreignField: '_id', as: 'rackInfo' }
    },
    {
      $unwind: { path: '$zoneInfo', preserveNullAndEmptyArrays: true }
    },
    {
      $unwind: { path: '$rackInfo', preserveNullAndEmptyArrays: true }
    },
    {
      $project: {
        _id: 0,
        zoneId: '$_id.zone',
        zoneName: '$zoneInfo.name',
        rackId: '$_id.rack',
        rackName: '$rackInfo.name',
        movementCount: 1,
        totalQuantityMoved: 1
      }
    },
    { $sort: { movementCount: -1 } }
  ]);

  // Normalize to 0-100 "heat" score
  const maxMovement = Math.max(...heatmapData.map(d => d.movementCount), 1);
  
  const normalizedHeatmap = heatmapData.map(d => ({
    ...d,
    heatScore: Math.round((d.movementCount / maxMovement) * 100),
    heatLevel: (d.movementCount / maxMovement) >= 0.7 ? 'hot' : (d.movementCount / maxMovement) >= 0.3 ? 'warm' : 'cold'
  }));

  return { heatmap: normalizedHeatmap };
};

// ─── Smart Picking Route ───────────────────────────────────────────────────────
exports.getPickingRoute = async (orderId, companyId) => {
  // In a real scenario, this would use a TSP (Traveling Salesperson Problem) solver 
  // or a spatial graph of the warehouse to plot the shortest path.
  // For this OS, we return an ordered list of locations.
  
  const Invoice = require('../models/Invoice');
  const { Inventory } = require('../models/Inventory');

  const order = await Invoice.findOne({ _id: orderId, company: companyId }).lean();
  if (!order) throw new Error('Order not found');

  const pickingList = [];

  for (const item of order.items) {
    if (!item.product) continue;
    
    // Find where this item is stored
    const stockLocations = await Inventory.find({ 
      company: companyId, 
      product: item.product,
      quantity: { $gt: 0 }
    })
    .populate('zone', 'name code')
    .populate('rack', 'name code')
    .populate('shelf', 'name code')
    .populate('bin', 'name code')
    .sort({ quantity: -1 })
    .lean();

    if (stockLocations.length > 0) {
      const bestLocation = stockLocations[0];
      pickingList.push({
        product: { id: item.product, name: item.productName, sku: item.sku },
        requiredQty: item.quantity,
        location: {
          zone: bestLocation.zone?.name,
          rack: bestLocation.rack?.name,
          shelf: bestLocation.shelf?.name,
          bin: bestLocation.bin?.name,
          availableQty: bestLocation.quantity
        },
        // Spatial sorting score (simplified: alphabetical sorting by zone/rack/shelf as a proxy for physical route)
        sortKey: `${bestLocation.zone?.code || ''}-${bestLocation.rack?.code || ''}-${bestLocation.shelf?.code || ''}`
      });
    }
  }

  // Sort by location string to minimize back-and-forth walking
  pickingList.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return {
    orderId,
    invoiceNumber: order.invoiceNumber,
    totalItems: pickingList.length,
    pickingRoute: pickingList
  };
};
