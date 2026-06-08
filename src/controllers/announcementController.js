const Announcement = require('../models/announcementModel');

const createAnnouncement = async (req, res) => {
  try {
    const { title, message, targetClass, image } = req.body;
    
    // Simple validation
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    const announcement = new Announcement({ title, message, targetClass, image });
    await announcement.save();

    res.status(201).json({ success: true, data: announcement });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAnnouncements = async (req, res) => {
  try {
    const { targetClass } = req.query;
    
    // Filter announcements: if a student requests, they see "all" and their specific class.
    // If admin requests (no targetClass), they see all.
    let filter = {};
    if (targetClass) {
      if (targetClass.toString() !== 'all') {
        const classNum = Number(targetClass);
        if (!isNaN(classNum)) {
          filter.targetClassIds = classNum;
        }
      }
    }

    const announcements = await Announcement.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: announcements });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const bulkDeleteAnnouncements = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Announcement ids must be a non-empty array' });
    }
    const result = await Announcement.updateMany(
      { _id: { $in: ids } },
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user?.id
      }
    );

    // Log audit actions
    const auditLogService = require('../services/auditLogService');
    for (const id of ids) {
      await auditLogService.log({
        actorId: req.user?.id,
        action: 'announcement_delete',
        targetType: 'Announcement',
        targetId: id
      });
    }

    res.json({
      success: true,
      message: `${result.modifiedCount || 0} announcement(s) deleted`,
      deletedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createAnnouncement, getAnnouncements, bulkDeleteAnnouncements };
