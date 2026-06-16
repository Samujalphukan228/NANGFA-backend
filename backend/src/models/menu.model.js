import mongoose from 'mongoose';

const menuSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String },
    priority: { type: Boolean, default: false },
    date: { type: Date, default: Date.now },
});

export const menuModel = mongoose.model('Menu', menuSchema);