import mongoose from 'mongoose';


const menuSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    image: { type: [String], required: true },
    date: { type: Number, default: Date.now },
})

export const menuModel = mongoose.model('Menu', menuSchema)