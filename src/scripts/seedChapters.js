const Class = require('../models/classModel');
const Chapter = require('../models/chapterModel');
const SyncVersion = require('../models/syncVersionModel');

const initialClasses = [
  { classId: 9, className: "Class 9" },
  { classId: 10, className: "Class 10" },
  { classId: 11, className: "Class 11" },
  { classId: 12, className: "Class 12" },
  { classId: 13, className: "Joint Entrance" }
];

const initialChapters = {
  9: [
    "Real Numbers",
    "Laws of Indices",
    "Graph",
    "Co-ordinate Geometry: Distance Formula",
    "Linear Simultaneous Equations",
    "Properties of Parallelogram",
    "Polynomial",
    "Factorisation",
    "Transversal & Mid-Point Theorem",
    "Profit and Loss",
    "Statistics",
    "Theorems on Area",
    "Construction: Construction of a Parallelogram whose measurement of one angle is given and equal in area of a Triangle",
    "Construction: Construction of a Triangle equal in area of a Quadrilateral",
    "Area & Perimeter of Triangle & Quadrilateral shaped region",
    "Circumference of Circle",
    "Theorems on Concurrence",
    "Area of Circular Region",
    "Co-ordinate Geometry: Internal and External Division of Straight Line Segment",
    "Co-ordinate Geometry: Area of Triangular Region",
    "Logarithm",
    "Set Theory",
    "Probability Theory"
  ],
  10: [
    "Quadratic equation in one variable",
    "Simple Interest",
    "Theorems related to circle",
    "Rectangular Parallelopiped or Cuboid",
    "Ratio and proportion",
    "Compound Interest and uniform rate of increase or decrease",
    "Theorems related to angles in a circle",
    "Right Circular Cylinder",
    "Quadratic Surd",
    "Theorems related to cyclic quadrilateral",
    "Construction: Circumcircle and Incircle of a triangle",
    "Sphere",
    "Variation",
    "Partnership Business",
    "Theorems related to Tangent to a circle",
    "Right circular cone",
    "Construction: Construction of tangent to a circle",
    "Similarity",
    "Problems on different solid objects",
    "Trigonometry: Measurement of angle",
    "Trigonometric Ratios & Identities",
    "Trigonometric Ratios of complementary angles",
    "Application of Trigonometric Ratios: Heights & Distances",
    "Statistics: Mean, Median, Mode, Ogive"
  ],
  11: [
    "Set Theory",
    "Relation and Function",
    "Trigonometry: Compund Angle",
    "Trigonometry: Multiple Angle",
    "Trigonometry: Sub Multiple Angle",
    "Trigonometry: Sums & Products",
    "Trigonometry: General Solution",
    "Laws of Indices",
    "Logarithm",
    "Mathematical Induction",
    "Complex Numbers",
    "Quadratic Equations",
    "Linear Inequations",
    "Permutation and Combination",
    "Binomial Theorem",
    "Sequence and Series",
    "Two Dimensional Coordinate Geometry",
    "Straight Line",
    "Circle",
    "Parabola",
    "Ellipse",
    "Hyperbola",
    "Three Dimensional Coordinate Geometry",
    "Real Numbers",
    "Limit",
    "Differentiation",
    "Significance of Derivative",
    "Mathematical Reasoning",
    "Statistics",
    "Probability"
  ],
  12: [
    "Relation",
    "Function",
    "Binary Operation",
    "Inverse Trigonometric Function",
    "Types of Matrices and Matrix Algebra",
    "Determinant",
    "Adjoint and Inverse of a Matrix and Solution of Simultaneous Linear Equations",
    "Limit",
    "Continuity and Differentiability",
    "Differentiation",
    "Second Order Derivative",
    "Indefinite Integral",
    "Definite Integral",
    "Differential Equation",
    "Tangent and Normal",
    "Increasing and Decreasing Function",
    "Maxima and Minima",
    "Definite Integral as an Area",
    "Vector Algebra",
    "Product of Two Vectors",
    "Direction Cosines and Direction Ratios",
    "Straight Line in Three Dimensional Space",
    "Plane",
    "Linear Programming",
    "Probability"
  ],
  13: [
    "11",
    "12",
    "Joint"
  ]
};

const seedChapters = async () => {
  try {
    console.log('Seeding initial classes and chapters...');

    // 1. Seed Classes
    for (const c of initialClasses) {
      try {
        await Class.findOneAndUpdate(
          { classId: c.classId },
          c,
          { upsert: true, new: true }
        );
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
    console.log('✓ Classes seeded');

    // 2. Seed Chapters
    const { normalizeChapterName } = require('../utils/chapterNormalization');
    for (const [classId, chapters] of Object.entries(initialChapters)) {
      const numericClassId = Number(classId);
      for (const chapterName of chapters) {
        const normalized = normalizeChapterName(chapterName);

        try {
          // Use findOneAndUpdate with upsert to prevent E11000 duplicate keys concurrently
          await Chapter.findOneAndUpdate(
            { classId: numericClassId, normalizedChapterName: normalized },
            { classId: numericClassId, chapterName: chapterName.trim() },
            { upsert: true, new: true, runValidators: true }
          );
        } catch (err) {
          if (err.code !== 11000) {
            console.error(`Failed to seed chapter "${chapterName}":`, err.message);
          }
        }
      }
    }
    console.log('✓ Chapters seeded');

    // 3. Initialize sync version
    try {
      const versionExists = await SyncVersion.findOne({ key: 'chapterVersion' });
      if (!versionExists) {
        await SyncVersion.create({ key: 'chapterVersion', value: 1 });
      }
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
    console.log('✓ Chapter sync version initialized');

  } catch (error) {
    console.error('Error seeding classes and chapters:', error.message);
  }
};

module.exports = seedChapters;
