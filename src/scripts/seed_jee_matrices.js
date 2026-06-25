/**
 * Seeding script to add 150 JEE Matrices and Determinants questions for Class JEE (Joint Entrance).
 * Distribution: 30% easy (45 questions), 30% medium (45 questions), 40% hard (60 questions).
 * Language: "Both".
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');
const Class = require('../models/classModel');
const Chapter = require('../models/chapterModel');

const easyQuestions = [];
const mediumQuestions = [];
const hardQuestions = [];

// ==========================================
// 1. GENERATE EASY QUESTIONS (45 questions)
// ==========================================

// Easy Type 1: 2x2 Determinant Calculation (15 questions)
const easyCoords = [
  { a: 2, b: 3, c: 4, d: 5, ans: -2, w1: -10, w2: 14, w3: 2 },
  { a: 3, b: -1, c: 2, d: 4, ans: 14, w1: 10, w2: 12, w3: -14 },
  { a: 5, b: 2, c: -3, d: 1, ans: 11, w1: -1, w2: 5, w3: -11 },
  { a: -2, b: 4, c: 3, d: -5, ans: -2, w1: 22, w2: -22, w3: 10 },
  { a: 6, b: 0, c: 5, d: -3, ans: -18, w1: 0, w2: 18, w3: -15 },
  { a: 1, b: 7, c: -2, d: 5, ans: 19, w1: -9, w2: 9, w3: -19 },
  { a: -4, b: -2, c: 3, d: 5, ans: -14, w1: -26, w2: 14, w3: -20 },
  { a: 8, b: 3, c: 2, d: 1, ans: 2, w1: 14, w2: -2, w3: 11 },
  { a: 5, b: -5, c: 1, d: 2, ans: 15, w1: 5, w2: -15, w3: 0 },
  { a: 3, b: 9, c: -1, d: -2, ans: 3, w1: -3, w2: -15, w3: 15 },
  { a: 2, b: 8, c: 0, d: 4, ans: 8, w1: 0, w2: 16, w3: -8 },
  { a: -3, b: 2, c: -4, d: 5, ans: -7, w1: -23, w2: 7, w3: -15 },
  { a: 7, b: 1, c: 6, d: 2, ans: 8, w1: 20, w2: -8, w3: 0 },
  { a: 4, b: 4, c: -1, d: 3, ans: 16, w1: 8, w2: -16, w3: 12 },
  { a: -1, b: 6, c: 2, d: -4, ans: -8, w1: 8, w2: -16, w3: 16 }
];

easyCoords.forEach((item, index) => {
  easyQuestions.push({
    question: `Evaluate the determinant of the $2 \\times 2$ matrix $A = \\begin{bmatrix} ${item.a} & ${item.b} \\\\ ${item.c} & ${item.d} \\end{bmatrix}.`,
    correctAnswer: `${item.ans}`,
    wrongAnswers: [`${item.w1}`, `${item.w2}`, `${item.w3}`]
  });
});

// Easy Type 2: 3x3 Triangular Determinant Calculation (15 questions)
const easyTriangular = [
  { a: 2, b: 3, c: 4, ans: 24, w1: 0, w2: 9, w3: 12 },
  { a: 3, b: -1, c: 5, ans: -15, w1: 15, w2: 7, w3: 0 },
  { a: 5, b: 2, c: 2, ans: 20, w1: 9, w2: 10, w3: -20 },
  { a: -2, b: 4, c: -3, ans: 24, w1: -24, w2: -1, w3: 0 },
  { a: 1, b: 8, c: 6, ans: 48, w1: 15, w2: -48, w3: 14 },
  { a: 4, b: 0, c: 3, ans: 0, w1: 12, w2: 7, w3: -12 },
  { a: -3, b: 5, c: 2, ans: -30, w1: 30, w2: 4, w3: 0 },
  { a: 6, b: 1, c: -1, ans: -6, w1: 6, w2: 0, w3: 5 },
  { a: 2, b: 7, c: 4, ans: 56, w1: 13, w2: -56, w3: 28 },
  { a: -5, b: 2, c: -2, ans: -20, w1: 20, w2: -5, w3: 0 },
  { a: 3, b: 3, c: 3, ans: 27, w1: 9, w2: -27, w3: 81 },
  { a: 1, b: -1, c: 10, ans: -10, w1: 10, w2: 0, w3: 9 },
  { a: 8, b: 2, c: 1, ans: 16, w1: 11, w2: -16, w3: 8 },
  { a: -4, b: 3, c: 3, ans: -36, w1: 36, w2: 2, w3: 0 },
  { a: 2, b: 5, c: -5, ans: -50, w1: 50, w2: 2, w3: 10 }
];

easyTriangular.forEach((item, index) => {
  easyQuestions.push({
    question: `Find the determinant of the upper triangular matrix $A = \\begin{bmatrix} ${item.a} & 5 & 9 \\\\ 0 & ${item.b} & -2 \\\\ 0 & 0 & ${item.c} \\end{bmatrix}.`,
    correctAnswer: `${item.ans}`,
    wrongAnswers: [`${item.w1}`, `${item.w2}`, `${item.w3}`]
  });
});

// Easy Type 3: Matrix Equality and Variable solving (15 questions)
const easyEquality = [
  { xVal: 2, yVal: 3, ans: 5, w1: 1, w2: -5, w3: 6 },
  { xVal: 4, yVal: 1, ans: 5, w1: 3, w2: -3, w3: 4 },
  { xVal: 5, yVal: -2, ans: 3, w1: 7, w2: -7, w3: -10 },
  { xVal: 1, yVal: 6, ans: 7, w1: -5, w2: 5, w3: 6 },
  { xVal: -3, yVal: 4, ans: 1, w1: -7, w2: 7, w3: -12 },
  { xVal: 2, yVal: 5, ans: 7, w1: -3, w2: 3, w3: 10 },
  { xVal: 6, yVal: 2, ans: 8, w1: 4, w2: -4, w3: 12 },
  { xVal: -1, yVal: 3, ans: 2, w1: -4, w2: 4, w3: -3 },
  { xVal: 3, yVal: 7, ans: 10, w1: -4, w2: 4, w3: 21 },
  { xVal: 4, yVal: -4, ans: 0, w1: 8, w2: -8, w3: -16 },
  { xVal: 5, yVal: 5, ans: 10, w1: 0, w2: -10, w3: 25 },
  { xVal: -2, yVal: -3, ans: -5, w1: 1, w2: -1, w3: 6 },
  { xVal: 7, yVal: 1, ans: 8, w1: 6, w2: -6, w3: 7 },
  { xVal: 3, yVal: 2, ans: 5, w1: 1, w2: -1, w3: 6 },
  { xVal: -4, yVal: 5, ans: 1, w1: -9, w2: 9, w3: -20 }
];

easyEquality.forEach((item, index) => {
  easyQuestions.push({
    question: `If $\\begin{bmatrix} 2x+1 & 5 \\\\ 0 & y-2 \\end{bmatrix} = \\begin{bmatrix} ${2*item.xVal + 1} & 5 \\\\ 0 & ${item.yVal - 2} \\end{bmatrix}$, find the value of $x + y$.`,
    correctAnswer: `${item.ans}`,
    wrongAnswers: [`${item.w1}`, `${item.w2}`, `${item.w3}`]
  });
});


// ==========================================
// 2. GENERATE MEDIUM QUESTIONS (45 questions)
// ==========================================

// Medium Type 1: Adjoint Determinant properties (15 questions)
const mediumAdj = [
  { detA: 2, ans: 4, w1: 2, w2: 8, w3: 16 },
  { detA: 3, ans: 9, w1: 3, w2: 27, w3: 6 },
  { detA: 4, ans: 16, w1: 4, w2: 64, w3: 8 },
  { detA: 5, ans: 25, w1: 5, w2: 125, w3: 10 },
  { detA: -2, ans: 4, w1: -2, w2: -8, w3: 8 },
  { detA: -3, ans: 9, w1: -9, w2: -27, w3: 27 },
  { detA: 1/2, ans: "1/4", w1: "1/2", w2: "1/8", w3: "2" },
  { detA: 6, ans: 36, w1: 6, w2: 216, w3: 12 },
  { detA: -4, ans: 16, w1: -16, w2: -64, w3: 64 },
  { detA: 10, ans: 100, w1: 10, w2: 1000, w3: 30 },
  { detA: 1/3, ans: "1/9", w1: "1/3", w2: "1/27", w3: "3" },
  { detA: 7, ans: 49, w1: 7, w2: 343, w3: 14 },
  { detA: -5, ans: 25, w1: -25, w2: -125, w3: 125 },
  { detA: 8, ans: 64, w1: 8, w2: 512, w3: 16 },
  { detA: 9, ans: 81, w1: 9, w2: 729, w3: 18 }
];

mediumAdj.forEach((item, index) => {
  mediumQuestions.push({
    question: `If $A$ is a square matrix of order 3 and the determinant of $A$ is $|A| = ${item.detA}$, find the determinant of its adjoint matrix $|\\text{adj}(A)|$.`,
    correctAnswer: `${item.ans}`,
    wrongAnswers: [`${item.w1}`, `${item.w2}`, `${item.w3}`]
  });
});

// Medium Type 2: Adjoint of scalar multiplier (15 questions)
const mediumAdjScalar = [
  { detA: 2, k: 2, ans: 32, w1: 8, w2: 16, w3: 64 },
  { detA: 3, k: 2, ans: 48, w1: 12, w2: 24, w3: 96 },
  { detA: 1, k: 3, ans: 81, w1: 9, w2: 27, w3: 243 },
  { detA: 2, k: 3, ans: 162, w1: 18, w2: 54, w3: 324 },
  { detA: -2, k: 2, ans: -32, w1: -8, w2: -16, w3: 32 },
  { detA: 3, k: -1, ans: 3, w1: -3, w2: 9, w3: -9 },
  { detA: 4, k: 2, ans: 64, w1: 16, w2: 32, w3: 128 },
  { detA: 2, k: -2, ans: 32, w1: -32, w2: 16, w3: -16 },
  { detA: 5, k: 2, ans: 80, w1: 20, w2: 40, w3: 160 },
  { detA: -3, k: 3, ans: -243, w1: -81, w2: 243, w3: 81 },
  { detA: 1, k: 4, ans: 256, w1: 16, w2: 64, w3: 1024 },
  { detA: 2, k: 4, ans: 512, w1: 32, w2: 128, w3: 1024 },
  { detA: -1, k: 2, ans: -16, w1: -4, w2: -8, w3: 16 },
  { detA: 3, k: 3, ans: 243, w1: 27, w2: 81, w3: 729 },
  { detA: 2, k: 5, ans: 500, w1: 50, w2: 100, w3: 1000 }
];

mediumAdjScalar.forEach((item, index) => {
  mediumQuestions.push({
    question: `Let $A$ be a $3 \\times 3$ square matrix. If $|A| = ${item.detA}$, evaluate the determinant $|\\text{adj}(${item.k}A)|$.`,
    correctAnswer: `${item.ans}`,
    wrongAnswers: [`${item.w1}`, `${item.w2}`, `${item.w3}`]
  });
});

// Medium Type 3: Area of Triangle and Collinearity (15 questions)
const mediumArea = [
  { x1: 1, y1: 2, x2: 3, y2: 4, x3: 5, y3: 6, ans: "Collinear (Area = 0)", w1: "Area = 4 sq. units", w2: "Area = 8 sq. units", w3: "Area = 2 sq. units" },
  { x1: 0, y1: 0, x2: 4, y2: 0, x3: 0, y3: 3, ans: "6 sq. units", w1: "12 sq. units", w2: "3 sq. units", w3: "5 sq. units" },
  { x1: 1, y1: 1, x2: 4, y2: 1, x3: 1, y3: 5, ans: "6 sq. units", w1: "12 sq. units", w2: "8 sq. units", w3: "4 sq. units" },
  { x1: -2, y1: -3, x2: 3, y2: 2, x3: -1, y3: -2, ans: "1 sq. unit", w1: "2 sq. units", w2: "0.5 sq. units", w3: "0 sq. units" },
  { x1: 2, y1: 7, x2: 1, y2: 1, x3: 10, y3: 8, ans: "22.5 sq. units", w1: "45 sq. units", w2: "11.25 sq. units", w3: "15 sq. units" },
  { x1: 3, y1: 8, x2: -4, y2: 2, x3: 5, y3: -1, ans: "37.5 sq. units", w1: "75 sq. units", w2: "18.75 sq. units", w3: "30 sq. units" },
  { x1: 2, y1: 3, x2: -1, y2: 2, x3: 5, y3: 4, ans: "Collinear (Area = 0)", w1: "Area = 1 sq. unit", w2: "Area = 2 sq. units", w3: "Area = 0.5 sq. units" },
  { x1: 0, y1: 0, x2: 6, y2: 0, x3: 4, y3: 4, ans: "12 sq. units", w1: "24 sq. units", w2: "6 sq. units", w3: "10 sq. units" },
  { x1: -1, y1: 2, x2: 5, y2: 2, x3: 2, y3: 8, ans: "18 sq. units", w1: "36 sq. units", w2: "9 sq. units", w3: "12 sq. units" },
  { x1: 1, y1: 5, x2: 2, y2: 7, x3: 3, y3: 9, ans: "Collinear (Area = 0)", w1: "Area = 1 sq. unit", w2: "Area = 2 sq. units", w3: "Area = 0.5 sq. units" },
  { x1: -3, y1: 5, x2: 3, y2: -5, x3: 0, y3: 0, ans: "Collinear (Area = 0)", w1: "Area = 15 sq. units", w2: "Area = 30 sq. units", w3: "Area = 7.5 sq. units" },
  { x1: 2, y1: 4, x2: 2, y2: 8, x3: 6, y3: 4, ans: "8 sq. units", w1: "16 sq. units", w2: "4 sq. units", w3: "12 sq. units" },
  { x1: 1, y1: 3, x2: 0, y2: 0, x3: -1, y3: -3, ans: "Collinear (Area = 0)", w1: "Area = 3 sq. units", w2: "Area = 6 sq. units", w3: "Area = 1.5 sq. units" },
  { x1: 0, y1: 4, x2: 4, y2: 0, x3: 0, y3: 0, ans: "8 sq. units", w1: "16 sq. units", w2: "4 sq. units", w3: "6 sq. units" },
  { x1: 5, y1: 1, x2: 2, y2: 4, x3: 9, y3: -3, ans: "Collinear (Area = 0)", w1: "Area = 6 sq. units", w2: "Area = 12 sq. units", w3: "Area = 3 sq. units" }
];

mediumArea.forEach((item, index) => {
  mediumQuestions.push({
    question: `Find the area of the triangle with vertices at $P(${item.x1}, ${item.y1})$, $Q(${item.x2}, ${item.y2})$, and $R(${item.x3}, ${item.y3})$ using determinant properties.`,
    correctAnswer: `${item.ans}`,
    wrongAnswers: [`${item.w1}`, `${item.w2}`, `${item.w3}`]
  });
});


// ==========================================
// 3. GENERATE HARD QUESTIONS (60 questions)
// ==========================================

// Hard Type 1: System of 3 Equations consistency parameters (20 questions)
const hardSystem = [
  { a: 1, b: 2, c: 3, ans: "$\\lambda = 3, \\mu = 10$", w1: "$\\lambda = 3, \\mu \\neq 10$", w2: "$\\lambda \\neq 3, \\mu = 10$", w3: "$\\lambda \\neq 3, \\mu \\neq 10$" },
  { a: 2, b: 3, c: 4, ans: "$\\lambda = 4, \\mu = 12$", w1: "$\\lambda = 4, \\mu \\neq 12$", w2: "$\\lambda \\neq 4, \\mu = 12$", w3: "$\\lambda \\neq 4, \\mu \\neq 12$" },
  { a: 1, b: -1, c: 2, ans: "$\\lambda = 2, \\mu = 5$", w1: "$\\lambda = 2, \\mu \\neq 5$", w2: "$\\lambda \\neq 2, \\mu = 5$", w3: "$\\lambda \\neq 2, \\mu \\neq 5$" },
  { a: 3, b: 1, c: 5, ans: "$\\lambda = 5, \\mu = 15$", w1: "$\\lambda = 5, \\mu \\neq 15$", w2: "$\\lambda \\neq 5, \\mu = 15$", w3: "$\\lambda \\neq 5, \\mu \\neq 15$" },
  { a: -1, b: 2, c: -2, ans: "$\\lambda = -2, \\mu = -6$", w1: "$\\lambda = -2, \\mu \\neq -6$", w2: "$\\lambda \\neq -2, \\mu = -6$", w3: "$\\lambda \\neq -2, \\mu \\neq -6$" },
  { a: 2, b: -1, c: 3, ans: "$\\lambda = 3, \\mu = 9$", w1: "$\\lambda = 3, \\mu \\neq 9$", w2: "$\\lambda \\neq 3, \\mu = 9$", w3: "$\\lambda \\neq 3, \\mu \\neq 9$" },
  { a: 1, b: 4, c: 5, ans: "$\\lambda = 5, \\mu = 11$", w1: "$\\lambda = 5, \\mu \\neq 11$", w2: "$\\lambda \\neq 5, \\mu = 11$", w3: "$\\lambda \\neq 5, \\mu \\neq 11$" },
  { a: 3, b: 3, c: 6, ans: "$\\lambda = 6, \\mu = 18$", w1: "$\\lambda = 6, \\mu \\neq 18$", w2: "$\\lambda \\neq 6, \\mu = 18$", w3: "$\\lambda \\neq 6, \\mu \\neq 18$" },
  { a: 2, b: 1, c: 4, ans: "$\\lambda = 4, \\mu = 8$", w1: "$\\lambda = 4, \\mu \\neq 8$", w2: "$\\lambda \\neq 4, \\mu = 8$", w3: "$\\lambda \\neq 4, \\mu \\neq 8$" },
  { a: -2, b: 3, c: 1, ans: "$\\lambda = 1, \\mu = 7$", w1: "$\\lambda = 1, \\mu \\neq 7$", w2: "$\\lambda \\neq 1, \\mu = 7$", w3: "$\\lambda \\neq 1, \\mu \\neq 7$" },
  { a: 1, b: 3, c: 2, ans: "$\\lambda = 2, \\mu = 8$", w1: "$\\lambda = 2, \\mu \\neq 8$", w2: "$\\lambda \\neq 2, \\mu = 8$", w3: "$\\lambda \\neq 2, \\mu \\neq 8$" },
  { a: 4, b: 2, c: 6, ans: "$\\lambda = 6, \\mu = 20$", w1: "$\\lambda = 6, \\mu \\neq 20$", w2: "$\\lambda \\neq 6, \\mu = 20$", w3: "$\\lambda \\neq 6, \\mu \\neq 20$" },
  { a: -1, b: -1, c: -2, ans: "$\\lambda = -2, \\mu = -4$", w1: "$\\lambda = -2, \\mu \\neq -4$", w2: "$\\lambda \\neq -2, \\mu = -4$", w3: "$\\lambda \\neq -2, \\mu \\neq -4$" },
  { a: 2, b: 2, c: 4, ans: "$\\lambda = 4, \\mu = 10$", w1: "$\\lambda = 4, \\mu \\neq 10$", w2: "$\\lambda \\neq 4, \\mu = 10$", w3: "$\\lambda \\neq 4, \\mu \\neq 10$" },
  { a: 3, b: -2, c: 1, ans: "$\\lambda = 1, \\mu = 13$", w1: "$\\lambda = 1, \\mu \\neq 13$", w2: "$\\lambda \\neq 1, \\mu = 13$", w3: "$\\lambda \\neq 1, \\mu \\neq 13$" },
  { a: 1, b: 1, c: 2, ans: "$\\lambda = 2, \\mu = 6$", w1: "$\\lambda = 2, \\mu \\neq 6$", w2: "$\\lambda \\neq 2, \\mu = 6$", w3: "$\\lambda \\neq 2, \\mu \\neq 6$" },
  { a: 2, b: -3, c: -1, ans: "$\\lambda = -1, \\mu = 11$", w1: "$\\lambda = -1, \\mu \\neq 11$", w2: "$\\lambda \\neq -1, \\mu = 11$", w3: "$\\lambda \\neq -1, \\mu \\neq 11$" },
  { a: 1, b: 5, c: 6, ans: "$\\lambda = 6, \\mu = 12$", w1: "$\\lambda = 6, \\mu \\neq 12$", w2: "$\\lambda \\neq 6, \\mu = 12$", w3: "$\\lambda \\neq 6, \\mu \\neq 12$" },
  { a: 3, b: 2, c: 5, ans: "$\\lambda = 5, \\mu = 17$", w1: "$\\lambda = 5, \\mu \\neq 17$", w2: "$\\lambda \\neq 5, \\mu = 17$", w3: "$\\lambda \\neq 5, \\mu \\neq 17$" },
  { a: -1, b: 3, c: 2, ans: "$\\lambda = 2, \\mu = 4$", w1: "$\\lambda = 2, \\mu \\neq 4$", w2: "$\\lambda \\neq 2, \\mu = 4$", w3: "$\\lambda \\neq 2, \\mu \\neq 4$" }
];

hardSystem.forEach((item, index) => {
  hardQuestions.push({
    question: `Consider the system of linear equations: $x + y + z = 6$, $x + ${item.a}y + ${item.b}z = 10$, and $x + ${item.a}y + \\lambda z = \\mu$. Find the condition under which the system has infinitely many solutions.`,
    correctAnswer: `${item.ans}`,
    wrongAnswers: [`${item.w1}`, `${item.w2}`, `${item.w3}`]
  });
});

// Hard Type 2: Adjoint double determinant calculation (20 questions)
const hardDoubleAdj = [
  { detA: 2, ans: 16, w1: 4, w2: 8, w3: 64 },
  { detA: 3, ans: 81, w1: 9, w2: 27, w3: 243 },
  { detA: 4, ans: 256, w1: 16, w2: 64, w3: 1024 },
  { detA: 5, ans: 625, w1: 25, w2: 125, w3: 3125 },
  { detA: -2, ans: 16, w1: -16, w2: 8, w3: -8 },
  { detA: -3, ans: 81, w1: -81, w2: 27, w3: -27 },
  { detA: 6, ans: 1296, w1: 36, w2: 216, w3: 7776 },
  { detA: 1/2, ans: "1/16", w1: "1/4", w2: "1/8", w3: "2" },
  { detA: 1/3, ans: "1/81", w1: "1/9", w2: "1/27", w3: "3" },
  { detA: -4, ans: 256, w1: -256, w2: 64, w3: -64 },
  { detA: 7, ans: 2401, w1: 49, w2: 343, w3: 16807 },
  { detA: 8, ans: 4096, w1: 64, w2: 512, w3: 32768 },
  { detA: -5, ans: 625, w1: -625, w2: 125, w3: -125 },
  { detA: 10, ans: 10000, w1: 100, w2: 1000, w3: 30000 },
  { detA: 1/4, ans: "1/256", w1: "1/16", w2: "1/64", w3: "4" },
  { detA: 1.5, ans: "5.0625", w1: "2.25", w2: "3.375", w3: "1.5" },
  { detA: -1, ans: 1, w1: -1, w2: 0, w3: "Undefined" },
  { detA: 2.5, ans: "39.0625", w1: "6.25", w2: "15.625", w3: "2.5" },
  { detA: -6, ans: 1296, w1: -1296, w2: 216, w3: -216 },
  { detA: 12, ans: 20736, w1: 144, w2: 1728, w3: 248832 }
];

hardDoubleAdj.forEach((item, index) => {
  hardQuestions.push({
    question: `Let $A$ be a non-singular square matrix of order 3. If the determinant value is $|A| = ${item.detA}$, determine the value of the double adjoint determinant $|\\text{adj}(\\text{adj}(A))|$.`,
    correctAnswer: `${item.ans}`,
    wrongAnswers: [`${item.w1}`, `${item.w2}`, `${item.w3}`]
  });
});

// Hard Type 3: Matrix exponent and power pattern trace (20 questions)
const hardPowerTrace = [
  { a: 1, b: 2, n: 5, ans: "$\\begin{bmatrix} 1 & 10 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 32 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 5 & 10 \\\\ 0 & 5 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 5 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 3, n: 4, ans: "$\\begin{bmatrix} 1 & 12 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 81 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 4 & 12 \\\\ 0 & 4 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 4 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 5, n: 3, ans: "$\\begin{bmatrix} 1 & 15 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 125 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 3 & 15 \\\\ 0 & 3 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 3 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: -2, n: 6, ans: "$\\begin{bmatrix} 1 & -12 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 64 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 1 & -64 \\\\ 0 & 1 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & -2 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 4, n: 5, ans: "$\\begin{bmatrix} 1 & 20 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 1024 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 5 & 20 \\\\ 0 & 5 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 5 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 1, n: 10, ans: "$\\begin{bmatrix} 1 & 10 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 1024 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 10 & 10 \\\\ 0 & 10 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 1 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 6, n: 3, ans: "$\\begin{bmatrix} 1 & 18 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 216 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 3 & 18 \\\\ 0 & 3 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 6 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: -3, n: 4, ans: "$\\begin{bmatrix} 1 & -12 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 81 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 1 & -81 \\\\ 0 & 1 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & -3 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 2, n: 50, ans: "$\\begin{bmatrix} 1 & 100 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 2^{50} \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 50 & 100 \\\\ 0 & 50 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 50 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 1, n: 100, ans: "$\\begin{bmatrix} 1 & 100 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 2^{100} \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 100 & 100 \\\\ 0 & 100 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 1 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 3, n: 20, ans: "$\\begin{bmatrix} 1 & 60 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 3^{20} \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 20 & 60 \\\\ 0 & 20 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 20 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 7, n: 3, ans: "$\\begin{bmatrix} 1 & 21 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 343 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 3 & 21 \\\\ 0 & 3 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 3 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: -1, n: 8, ans: "$\\begin{bmatrix} 1 & -8 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 1 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 1 & -1 \\\\ 0 & 1 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 8 & -8 \\\\ 0 & 8 \\end{bmatrix}$" },
  { a: 1, b: 8, n: 2, ans: "$\\begin{bmatrix} 1 & 16 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 64 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 2 & 16 \\\\ 0 & 2 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 2 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: -4, n: 3, ans: "$\\begin{bmatrix} 1 & -12 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & -64 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 1 & 64 \\\\ 0 & 1 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & -3 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 9, n: 2, ans: "$\\begin{bmatrix} 1 & 18 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 81 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 2 & 18 \\\\ 0 & 2 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 9 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 1, n: 50, ans: "$\\begin{bmatrix} 1 & 50 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 2^{50} \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 50 & 50 \\\\ 0 & 50 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 1 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 2, n: 12, ans: "$\\begin{bmatrix} 1 & 24 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 4096 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 12 & 24 \\\\ 0 & 12 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 12 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: -5, n: 3, ans: "$\\begin{bmatrix} 1 & -15 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & -125 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 1 & 125 \\\\ 0 & 1 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & -3 \\\\ 0 & 1 \\end{bmatrix}$" },
  { a: 1, b: 10, n: 3, ans: "$\\begin{bmatrix} 1 & 30 \\\\ 0 & 1 \\end{bmatrix}$", w1: "$\\begin{bmatrix} 1 & 1000 \\\\ 0 & 1 \\end{bmatrix}$", w2: "$\\begin{bmatrix} 3 & 30 \\\\ 0 & 3 \\end{bmatrix}$", w3: "$\\begin{bmatrix} 1 & 10 \\\\ 0 & 1 \\end{bmatrix}$" }
];

hardPowerTrace.forEach((item, index) => {
  hardQuestions.push({
    question: `Let $A = \\begin{bmatrix} 1 & ${item.b} \\\\ 0 & 1 \\end{bmatrix}$. Deduce the matrix expression representing the power $A^{${item.n}}$.`,
    correctAnswer: `${item.ans}`,
    wrongAnswers: [`${item.w1}`, `${item.w2}`, `${item.w3}`]
  });
});


// Helper to shuffle array in-place (Durstenfeld shuffle algorithm)
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function seed() {
  await connectDB();
  console.log('Connected to Database. Seeding Class JEE Matrices and Determinants chapter...');

  // Find class "Joint Entrance" (classId = 13)
  const classDoc = await Class.findOne({ classId: 13 });
  if (!classDoc) {
    console.error('Class "Joint Entrance" not found in classes collection!');
    process.exit(1);
  }
  const classId = classDoc._id;

  // Find or create chapter "11: Matrices and Determinants"
  const { normalizeChapterName } = require('../utils/chapterNormalization');
  const normalized = normalizeChapterName('11: Matrices and Determinants');
  let chapterDoc = await Chapter.findOne({ classId, normalizedChapterName: normalized });
  if (!chapterDoc) {
    console.log('Chapter "11: Matrices and Determinants" not found. Creating it...');
    chapterDoc = await Chapter.create({
      classId: classId,
      chapterName: '11: Matrices and Determinants',
    });
  }
  const chapterId = chapterDoc._id;

  console.log(`Using classId: ${classId} ("Joint Entrance")`);
  console.log(`Matrices and Determinants chapterId: ${chapterId}`);

  let addedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  // Seeding easy questions (45)
  console.log('Seeding Easy Questions...');
  for (let i = 0; i < easyQuestions.length; i++) {
    const qData = easyQuestions[i];
    const allOptions = [qData.correctAnswer, ...qData.wrongAnswers];
    const shuffledOptions = shuffle([...allOptions]);

    const newQuestion = new Question({
      language: 'Both',
      classId: classId,
      chapterId: chapterId,
      question: qData.question,
      options: shuffledOptions,
      correctAnswer: qData.correctAnswer,
      diagram: null,
      formulaKeywords: [],
      isDeleted: false
    });

    try {
      await newQuestion.save();
      addedCount++;
    } catch (err) {
      if (err.code === 11000) {
        duplicateCount++;
      } else {
        console.error(`Error saving Easy question ${i + 1}: ${err.message}`);
        errorCount++;
      }
    }
  }

  // Seeding medium questions (45)
  console.log('Seeding Medium Questions...');
  for (let i = 0; i < mediumQuestions.length; i++) {
    const qData = mediumQuestions[i];
    const allOptions = [qData.correctAnswer, ...qData.wrongAnswers];
    const shuffledOptions = shuffle([...allOptions]);

    const newQuestion = new Question({
      language: 'Both',
      classId: classId,
      chapterId: chapterId,
      question: qData.question,
      options: shuffledOptions,
      correctAnswer: qData.correctAnswer,
      diagram: null,
      formulaKeywords: [],
      isDeleted: false
    });

    try {
      await newQuestion.save();
      addedCount++;
    } catch (err) {
      if (err.code === 11000) {
        duplicateCount++;
      } else {
        console.error(`Error saving Medium question ${i + 1}: ${err.message}`);
        errorCount++;
      }
    }
  }

  // Seeding hard questions (60)
  console.log('Seeding Hard Questions...');
  for (let i = 0; i < hardQuestions.length; i++) {
    const qData = hardQuestions[i];
    const allOptions = [qData.correctAnswer, ...qData.wrongAnswers];
    const shuffledOptions = shuffle([...allOptions]);

    const newQuestion = new Question({
      language: 'Both',
      classId: classId,
      chapterId: chapterId,
      question: qData.question,
      options: shuffledOptions,
      correctAnswer: qData.correctAnswer,
      diagram: null,
      formulaKeywords: [],
      isDeleted: false
    });

    try {
      await newQuestion.save();
      addedCount++;
    } catch (err) {
      if (err.code === 11000) {
        duplicateCount++;
      } else {
        console.error(`Error saving Hard question ${i + 1}: ${err.message}`);
        errorCount++;
      }
    }
  }

  console.log('====================================================');
  console.log('SEEDING COMPLETED SUMMARY:');
  console.log(`Successfully added: ${addedCount} questions`);
  console.log(`Duplicate skipped: ${duplicateCount} questions`);
  console.log(`Errors encountered: ${errorCount} questions`);
  console.log('====================================================');
  
  await mongoose.disconnect();
  console.log('Disconnected from database.');
}

seed().catch(err => {
  console.error('Seeding process failed:', err);
  process.exit(1);
});
