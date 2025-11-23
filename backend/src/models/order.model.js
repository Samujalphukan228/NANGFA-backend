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
        enum: ['preparing', 'completed'],
        default: 'preparing' 
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    date: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } // 7 days
});


orderSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const orderModel = mongoose.model('Order', orderSchema);