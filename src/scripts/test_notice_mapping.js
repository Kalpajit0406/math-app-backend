require('dotenv').config();
const mongoose = require('mongoose');
const Announcement = require('../models/announcementModel');
const { createAnnouncement, getAnnouncements } = require('../controllers/announcementController');

async function testMapping() {
  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME
  });
  console.log('Connected!');

  // Clear any existing test notices
  await Announcement.deleteMany({ title: /^TEST_MAPPING_/ });

  // 1. Mock req/res for class 12 notice creation
  console.log('\n--- Test 1: Create announcement specifically for class 12 ---');
  let mockResData = null;
  const mockReq1 = {
    body: {
      title: 'TEST_MAPPING_12',
      message: 'This is a test notice for class 12 students only.',
      targetClass: '12'
    }
  };
  const mockRes1 = {
    status(code) {
      console.log(`Response status code: ${code}`);
      return this;
    },
    json(obj) {
      console.log('Response JSON:', JSON.stringify(obj, null, 2));
      mockResData = obj;
      return this;
    }
  };

  await createAnnouncement(mockReq1, mockRes1);

  // Validate the returned creation data
  if (!mockResData || !mockResData.success) {
    throw new Error('Announcement creation failed');
  }
  const createdAnn = mockResData.data;
  if (createdAnn.targetClass !== '12') {
    throw new Error(`Expected targetClass to be '12', got: ${createdAnn.targetClass}`);
  }
  console.log('✓ Create Announcement targetClass check passed!');

  // 2. Mock req/res for retrieving notices
  console.log('\n--- Test 2: Fetch announcements list (check targetClass mapping) ---');
  let mockListResData = null;
  const mockReq2 = {
    query: {
      targetClass: '12'
    }
  };
  const mockRes2 = {
    status(code) {
      return this;
    },
    json(obj) {
      mockListResData = obj;
      return this;
    }
  };

  await getAnnouncements(mockReq2, mockRes2);

  if (!mockListResData || !mockListResData.success) {
    throw new Error('Fetching announcements failed');
  }

  const list = mockListResData.data;
  const found = list.find(a => a.title === 'TEST_MAPPING_12');
  if (!found) {
    throw new Error('Created announcement not found in the list');
  }
  console.log('Fetched announcement details:', JSON.stringify(found, null, 2));
  if (found.targetClass !== '12') {
    throw new Error(`Expected fetched targetClass to be '12', got: ${found.targetClass}`);
  }
  console.log('✓ Fetch Announcements targetClass check passed!');

  // Clean up
  await Announcement.deleteMany({ title: /^TEST_MAPPING_/ });
  console.log('\n✓ Cleanup complete. All mapping tests passed successfully!');
  await mongoose.disconnect();
}

testMapping().catch(err => {
  console.error('Test failed:', err);
  mongoose.disconnect().then(() => process.exit(1));
});
