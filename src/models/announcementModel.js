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
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret.__v;
      if (!ret.targetClass) {
        if (!ret.targetClassIds || ret.targetClassIds.length === 0 || ret.targetClassIds.length >= 4) {
          ret.targetClass = 'all';
        } else {
          ret.targetClass = String(ret.targetClassIds[0]);
        }
      }
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

// Virtual for legacy targetClass compatibility
announcementSchema.virtual('targetClass')
  .get(function() {
    if (!this.targetClassIds || this.targetClassIds.length === 0 || this.targetClassIds.length >= 4) {
      return 'all';
    }
    return String(this.targetClassIds[0]);
  })
  .set(function(val) {
    if (val === 'all' || !val) {
      this.targetClassIds = [9, 10, 11, 12, 13];
    } else {
      const num = Number(val);
      if (!isNaN(num)) {
        this.targetClassIds = [num];
      } else {
        this.targetClassIds = [];
      }
    }
  });

// Pre-find hook to automatically filter out soft-deleted announcements
announcementSchema.pre(/^find/, function() {
  this.where({ isDeleted: { $ne: true } });
});

module.exports = mongoose.model('Announcement', announcementSchema);
