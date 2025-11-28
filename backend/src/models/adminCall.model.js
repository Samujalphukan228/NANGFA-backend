// adminCall.model.js
import mongoose from "mongoose";

const adminCallSchema = new mongoose.Schema({
    admin: {
        type: String,  
        required: true
    },
    kitchenStaff: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee"
    },
    startTime: {
        type: Date,
        default: Date.now
    },
    endTime: {
        type: Date
    },
    duration: {
        type: Number, 
        default: 0
    },
    status: {
        type: String,
        enum: ['ongoing', 'completed', 'missed'],
        default: 'ongoing'
    }
}, {
    timestamps: true
});

// Calculate duration before saving
adminCallSchema.pre('save', function(next) {
    if (this.startTime && this.endTime) {
        this.duration = Math.floor((this.endTime - this.startTime) / 1000);
    }
    next();
});

export const adminCallModel = mongoose.model("AdminCall", adminCallSchema);