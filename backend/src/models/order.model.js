// order.model.js
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    menuItems: [{ 
        menuId: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu', required: true },
        quantity: { type: Number, required: true, min: 1 }
    }],
    totalPrice: { type: Number, required: true, min: 0 },
    tableNumber: { type: Number },
    status: { 
        type: String, 
        enum: ['preparing', 'completed', 'cancelled'],
        default: 'preparing' 
    },
    
    // ✅ CHANGED: From ObjectId to String
    createdBy: { 
        type: String,  // ← Changed from ObjectId
        required: true,
        default: 'admin'
    },
    
    date: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },

    updatedItems: [{
        menuId: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu' },
        oldQuantity: { type: Number },
        newQuantity: { type: Number },
        type: { type: String, enum: ['increased', 'decreased'] }
    }],
    newItems: [{ 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Menu'
    }],
    removedItems: [{  
        menuId: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu' },
        name: { type: String },
        quantity: { type: Number }
    }],
    lastUpdatedAt: { type: Date, default: null },
    
    // ✅ CHANGED: updatedBy also to String
    updateHistory: [{  
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: String },  // ← Changed from ObjectId
        changes: {
            added: [{ menuId: String, name: String, quantity: Number }],
            removed: [{ menuId: String, name: String, quantity: Number }],
            updated: [{ menuId: String, name: String, oldQuantity: Number, newQuantity: Number }]
        }
    }],
    
    expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
}, {
    timestamps: true  
});

orderSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ tableNumber: 1, status: 1 });

export const orderModel = mongoose.model('Order', orderSchema);