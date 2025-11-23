import mongoose from 'mongoose';

const revenueSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    amount: { type: Number, required: true, default: 0 },
    orderCount: { type: Number, default: 0 }
});

revenueSchema.index({ date: 1 }, { unique: true });

export const revenueModel = mongoose.model('Revenue', revenueSchema);