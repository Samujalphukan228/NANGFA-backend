import mongoose from 'mongoose';

// ✅ Order Schema - FIXED with auto-delete after 1 minute
const orderSchema = new mongoose.Schema({
    menuItems: [{ 
        menuId: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu', required: true },
        name: { type: String },
        price: { type: Number },
        category: { type: String },
        quantity: { type: Number, required: true, min: 1 }
    }],
    
    totalPrice: { type: Number, required: true, min: 0 },
    
    tableNumber: [{ 
        type: Number 
    }],
    
    status: { 
        type: String, 
        enum: ['preparing', 'completed', 'cancelled'],
        default: 'preparing' 
    },
    
    createdBy: { 
        type: String,  
        required: true,
        default: 'admin'
    },
    
    date: { type: Date, default: Date.now },
    
    // ✅ FIXED: Added missing fields
    completedAt: { type: Date, default: null },
    completedBy: { type: String, default: null },

    // ⏰ AUTO-DELETE FIELD: Set when order is completed, MongoDB will delete after 60 seconds
    deleteAt: { type: Date, default: null },  // ← NEW FIELD FOR AUTO-DELETE

    updatedItems: [{
        menuId: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu' },
        name: { type: String },
        category: { type: String },
        oldQuantity: { type: Number },
        newQuantity: { type: Number },
        type: { type: String, enum: ['increased', 'decreased'] }
    }],
    
    newItems: [{ 
        menuId: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu' },
        name: { type: String },
        category: { type: String },
        quantity: { type: Number }
    }],
    
    removedItems: [{  
        menuId: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu' },
        name: { type: String },
        category: { type: String },
        quantity: { type: Number }
    }],
    
    lastUpdatedAt: { type: Date, default: null },
    
    updateHistory: [{  
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: String },
        changes: {
            added: [{ 
                menuId: { type: String }, 
                name: { type: String }, 
                category: { type: String },
                quantity: { type: Number } 
            }],
            removed: [{ 
                menuId: { type: String }, 
                name: { type: String }, 
                category: { type: String },
                quantity: { type: Number } 
            }],
            updated: [{ 
                menuId: { type: String }, 
                name: { type: String }, 
                category: { type: String },
                oldQuantity: { type: Number }, 
                newQuantity: { type: Number } 
            }]
        }
    }],
    
    cancellationReason: { type: String },
    cancelledAt: { type: Date },
    cancelledBy: { type: String },
    
    expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
}, {
    timestamps: true  // ✅ This handles createdAt and updatedAt automatically
});

// Indexes
orderSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ⏰ TTL INDEX: Auto-delete completed orders after 60 seconds (1 minute)
orderSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 60 });  // ← AUTO-DELETE INDEX

orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ tableNumber: 1, status: 1 });
orderSchema.index({ 'menuItems.category': 1 });
orderSchema.index({ completedAt: 1 }); // ✅ Added index for completedAt queries

// Virtuals
orderSchema.virtual('itemsByCategory').get(function() {
    const grouped = {};
    this.menuItems.forEach(item => {
        const category = item.category || 'uncategorized';
        if (!grouped[category]) {
            grouped[category] = [];
        }
        grouped[category].push(item);
    });
    return grouped;
});

orderSchema.virtual('categories').get(function() {
    const categories = new Set();
    this.menuItems.forEach(item => {
        categories.add(item.category || 'uncategorized');
    });
    return Array.from(categories);
});

orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

export const orderModel = mongoose.model('Order', orderSchema);


// ✅ Revenue by Category Schema (Auto-deletes next day)
const revenueByCategorySchema = new mongoose.Schema({
    date: { 
        type: Date, 
        required: true 
    },
    category: { 
        type: String, 
        default: 'uncategorized' 
    },
    categoryName: {
        type: String
    },
    totalRevenue: { 
        type: Number, 
        default: 0 
    },
    totalQuantity: { 
        type: Number, 
        default: 0 
    },
    orderCount: { 
        type: Number, 
        default: 0 
    },
    expiresAt: { 
        type: Date, 
        default: function() {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            return tomorrow;
        }
    }
}, {
    timestamps: true
});

revenueByCategorySchema.index({ date: 1, category: 1 }, { unique: true });
revenueByCategorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const revenueByCategoryModel = mongoose.model('RevenueByCategory', revenueByCategorySchema);