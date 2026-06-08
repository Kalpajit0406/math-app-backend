const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true },
  targetClassIds: { type: [Number], default: [] },
  image: { type: String }, // optional image URL
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' }
}, { 
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Pre-find hook to automatically filter out soft-deleted announcements
announcementSchema.pre(/^find/, function() {
  this.where({ isDeleted: { $ne: true } });
});

module.exports = mongoose.model('Announcement', announcementSchema);
