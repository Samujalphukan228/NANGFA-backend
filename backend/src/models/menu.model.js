import mongoose from 'mongoose';

const menuSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    priority: { type: Boolean, default: false }, // true = high priority item
    date: { type: Number, default: Date.now },
})

export const menuModel = mongoose.model('Menu', menuSchema)