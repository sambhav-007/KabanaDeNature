'use strict';

// Factory: choose the inventory source of truth from env.
const which = (process.env.INVENTORY_PROVIDER || 'local').toLowerCase();

let provider;
if (which === 'cm') {
  provider = require('./CMInventoryProvider');
} else {
  provider = require('./LocalInventoryProvider');
}

console.log(`[inventory] using provider: ${provider.name}`);
module.exports = provider;
