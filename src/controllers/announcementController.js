// Announcement Controller with backward compatibility for targetClass mapping
const Announcement = require('../models/announcementModel');

/** Create an announcement.
 * Accepts `title`, `message`, optional `targetClassIds` array (or legacy `targetClass` string), and `image`.
 * If omitted, defaults to all classes (9-13).
 */
const createAnnouncement = async (req, res) => {
  try {
    const { title, message, targetClassIds: bodyClassIds, targetClass, image } = req.body;

    // Basic validation
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    // Resolve target classes
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

    // Convert to object and delete targetClass to ensure response does not contain it
    const responseData = announcement.toJSON();
    delete responseData.targetClass;

    res.status(201).json({ success: true, data: responseData });
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
    
    // Ensure response output does not contain targetClass
    const sanitizedAnnouncements = announcements.map(ann => {
      const annObj = ann.toJSON();
      delete annObj.targetClass;
      return annObj;
    });

    res.json({ success: true, data: sanitizedAnnouncements });
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
