// Updated Announcement Controller without targetClass handling


/** Create an announcement.
 * Accepts `title`, `message`, optional `targetClassIds` array, and `image`.
 * If `targetClassIds` is omitted, defaults to all classes (9‑13).
 */
const createAnnouncement = async (req, res) => {
  try {
    const { title, message, targetClassIds: bodyClassIds, image } = req.body;

    // Basic validation (handled earlier by middleware)
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    // Resolve target classes
    let targetClassIds = bodyClassIds;
    if (!targetClassIds) {
      // Default to all classes when not specified
      targetClassIds = [9, 10, 11, 12, 13];
    }

    const announcement = new Announcement({ title, message, targetClassIds, image });
    await announcement.save();

    res.status(201).json({ success: true, data: announcement });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Retrieve announcements.
 * `targetClass` query param filters for a specific class number.
 * If omitted, returns all announcements.
 */
const getAnnouncements = async (req, res) => {
  try {
    const { targetClass } = req.query;
    let filter = {};
    if (targetClass && targetClass.toString() !== 'all') {
      const classNum = Number(targetClass);
      if (!isNaN(classNum)) {
        // Match any announcement that includes the class number in targetClassIds
        filter.targetClassIds = classNum;
      }
    }
    const announcements = await Announcement.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: announcements });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Bulk soft‑delete announcements */
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

const createAnnouncement = async (req, res) => {
  try {
    const { title, message, targetClass, targetClassIds: bodyClassIds, image } = req.body;
    
    // Simple validation
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    let targetClassIds = bodyClassIds;
    if (!targetClassIds) {
      if (targetClass === 'all' || !targetClass) {
        targetClassIds = [9, 10, 11, 12, 13];
      } else {
        const num = Number(targetClass);
        targetClassIds = !isNaN(num) ? [num] : [];
      }
    }

    const announcement = new Announcement({ title, message, targetClassIds, image });
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
