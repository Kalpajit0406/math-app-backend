/**
 * Seeding script to add 100 questions in Matrices chapter for Class 12.
 * Distribution: 30% easy (30 questions), 30% medium (30 questions), 40% hard (40 questions).
 * Language: "Both".
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');
const Class = require('../models/classModel');
const Chapter = require('../models/chapterModel');

const matricesQuestions = [
  // ==========================================
  // MATRICES: EASY (30 questions)
  // ==========================================
  {
    question: "If a matrix has 18 elements, what are the possible orders it can have?",
    correctAnswer: "6",
    wrongAnswers: ["4", "5", "8"]
  },
  {
    question: "If $A = [a_{ij}]$ is a $3 \\times 4$ matrix, then the total number of elements in $A$ is:",
    correctAnswer: "12",
    wrongAnswers: ["7", "10", "16"]
  },
  {
    question: "Construct a $2 \\times 2$ matrix $A = [a_{ij}]$ whose elements are given by $a_{ij} = \\frac{(i+j)^2}{2}$. The matrix is:",
    correctAnswer: "$\\begin{bmatrix} 2 & 9/2 \\\\ 9/2 & 8 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 2 & 9 \\\\ 9 & 8 \\end{bmatrix}$",
      "$\\begin{bmatrix} 1 & 9/2 \\\\ 9/2 & 4 \\end{bmatrix}$",
      "$\\begin{bmatrix} 2 & 3 \\\\ 3 & 8 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $\\begin{bmatrix} x+y & 2 \\\\ 5+z & xy \\end{bmatrix} = \\begin{bmatrix} 6 & 2 \\\\ 5 & 8 \\end{bmatrix}$, find the value of $z$.",
    correctAnswer: "$0$",
    wrongAnswers: ["$5$", "$2$", "$8$"]
  },
  {
    question: "A matrix $A = [a_{ij}]_{m \\times n}$ is a square matrix if:",
    correctAnswer: "$m = n$",
    wrongAnswers: ["$m < n$", "$m > n$", "None of these"]
  },
  {
    question: "The diagonal elements of a skew-symmetric matrix are always:",
    correctAnswer: "all zero",
    wrongAnswers: ["all one", "any real numbers", "all negative"]
  },
  {
    question: "If $A$ is a matrix of order $m \\times n$ and $B$ is a matrix of order $n \\times p$, then the order of the product matrix $AB$ is:",
    correctAnswer: "$m \\times p$",
    wrongAnswers: ["$n \\times n$", "$p \\times m$", "$n \\times p$"]
  },
  {
    question: "If $A = \\begin{bmatrix} 2 & 4 \\\\ 3 & 2 \\end{bmatrix}$ and $B = \\begin{bmatrix} 1 & 3 \\\\ -2 & 5 \\end{bmatrix}$, then the sum matrix $A + B$ is:",
    correctAnswer: "$\\begin{bmatrix} 3 & 7 \\\\ 1 & 7 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 3 & 7 \\\\ 5 & 7 \\end{bmatrix}$",
      "$\\begin{bmatrix} 1 & 1 \\\\ 5 & -3 \\end{bmatrix}$",
      "$\\begin{bmatrix} 3 & 12 \\\\ -6 & 10 \\end{bmatrix}$"
    ]
  },
  {
    question: "For any square matrix $A$ with real number entries, the matrix $A + A'$ is always:",
    correctAnswer: "Symmetric",
    wrongAnswers: ["Skew-symmetric", "Diagonal", "Identity"]
  },
  {
    question: "For any square matrix $A$ with real number entries, the matrix $A - A'$ is always:",
    correctAnswer: "Skew-symmetric",
    wrongAnswers: ["Symmetric", "Diagonal", "Zero matrix"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$, then the transpose matrix $A'$ is:",
    correctAnswer: "$\\begin{bmatrix} 1 & 3 \\\\ 2 & 4 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 4 & 2 \\\\ 3 & 1 \\end{bmatrix}$",
      "$\\begin{bmatrix} 2 & 1 \\\\ 4 & 3 \\end{bmatrix}$",
      "$\\begin{bmatrix} -1 & -2 \\\\ -3 & -4 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $\\begin{bmatrix} 2x+y & 3 \\\\ 0 & 4 \\end{bmatrix} = \\begin{bmatrix} 7 & 3 \\\\ 0 & 4 \\end{bmatrix}$ and $y = 3$, find the value of $x$.",
    correctAnswer: "$2$",
    wrongAnswers: ["$3$", "$1$", "$4$"]
  },
  {
    question: "A diagonal matrix in which all diagonal elements are equal is called a:",
    correctAnswer: "Scalar matrix",
    wrongAnswers: ["Identity matrix", "Symmetric matrix", "Zero matrix"]
  },
  {
    question: "A square matrix $A = [a_{ij}]$ is called an identity matrix if $a_{ij} = 0$ for $i \\neq j$ and $a_{ij} = 1$ for $i = j$. The order of an identity matrix must be:",
    correctAnswer: "Square ($n \\times n$)",
    wrongAnswers: ["Rectangular ($m \\times n$)", "Row matrix ($1 \\times n$)", "Column matrix ($m \\times 1$)"]
  },
  {
    question: "If a matrix has 5 elements, what are the possible orders it can have?",
    correctAnswer: "2",
    wrongAnswers: ["1", "4", "3"]
  },
  {
    question: "If $A = \\begin{bmatrix} 0 & 2 \\\\ 2 & 0 \\end{bmatrix}$, then $A^2$ is:",
    correctAnswer: "$\\begin{bmatrix} 4 & 0 \\\\ 0 & 4 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 0 & 4 \\\\ 4 & 0 \\end{bmatrix}$",
      "$\\begin{bmatrix} 2 & 2 \\\\ 2 & 2 \\end{bmatrix}$",
      "$\\begin{bmatrix} 0 & 0 \\\\ 0 & 0 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A$ is of order $2 \\times 3$ and $B$ is of order $3 \\times 2$, then the order of $BA$ is:",
    correctAnswer: "$3 \\times 3$",
    wrongAnswers: ["$2 \\times 2$", "$2 \\times 3$", "$3 \\times 2$"]
  },
  {
    question: "If $A$ and $B$ are square matrices of the same order, then $(A+B)'$ is equal to:",
    correctAnswer: "$A' + B'$",
    wrongAnswers: ["$B' + A'$", "$AB'$", "$A'B'$"]
  },
  {
    question: "Which of the given values of $x$ and $y$ make the following pair of matrices equal: $\\begin{bmatrix} 3x+7 & 5 \\\\ y+1 & 2-3x \\end{bmatrix}, \\begin{bmatrix} 0 & y-2 \\\\ 8 & 4 \\end{bmatrix}$?",
    correctAnswer: "No possible values",
    wrongAnswers: [
      "$x = -1/3, y = 7$",
      "$x = -2/3, y = 7$",
      "$x = -1/3, y = -2/3$"
    ]
  },
  {
    question: "The number of all possible matrices of order $3 \\times 3$ with each entry 0 or 1 is:",
    correctAnswer: "512",
    wrongAnswers: ["27", "18", "81"]
  },
  {
    question: "If $A = \\begin{bmatrix} \\cos \\alpha & -\\sin \\alpha \\\\ \\sin \\alpha & \\cos \\alpha \\end{bmatrix}$, then $A + A' = I$ if the value of $\\alpha$ is:",
    correctAnswer: "$\\pi/3$",
    wrongAnswers: ["$\\pi/6$", "$3\\pi/2$", "$\\pi$"]
  },
  {
    question: "If $A$ and $B$ are symmetric matrices of the same order, then $AB - BA$ is a:",
    correctAnswer: "Skew-symmetric matrix",
    wrongAnswers: ["Symmetric matrix", "Zero matrix", "Identity matrix"]
  },
  {
    question: "If $A$ is a square matrix such that $A^2 = A$, then $(I + A)^3 - 7A$ is equal to:",
    correctAnswer: "$I$",
    wrongAnswers: ["$A$", "$I - A$", "$3A$"]
  },
  {
    question: "If $A = \\begin{bmatrix} 3 & 1 \\\\ -1 & 2 \\end{bmatrix}$, then $3A$ is:",
    correctAnswer: "$\\begin{bmatrix} 9 & 3 \\\\ -3 & 6 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 9 & 1 \\\\ -1 & 2 \\end{bmatrix}$",
      "$\\begin{bmatrix} 6 & 4 \\\\ 2 & 5 \\end{bmatrix}$",
      "$\\begin{bmatrix} 9 & 3 \\\\ -1 & 2 \\end{bmatrix}$"
    ]
  },
  {
    question: "In a matrix $A = [a_{ij}]$, if $a_{ij} = 0$ for $i > j$, then the matrix is called a:",
    correctAnswer: "Upper triangular matrix",
    wrongAnswers: ["Lower triangular matrix", "Diagonal matrix", "Symmetric matrix"]
  },
  {
    question: "In a matrix $A = [a_{ij}]$, if $a_{ij} = 0$ for $i < j$, then the matrix is called a:",
    correctAnswer: "Lower triangular matrix",
    wrongAnswers: ["Upper triangular matrix", "Diagonal matrix", "Skew-symmetric matrix"]
  },
  {
    question: "If $A$ is a symmetric matrix, then $k A$ (where $k$ is a scalar) is a:",
    correctAnswer: "Symmetric matrix",
    wrongAnswers: ["Skew-symmetric matrix", "Diagonal matrix", "Identity matrix"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 0 & 0 \\\\ 0 & 2 & 0 \\\\ 0 & 0 & 3 \\end{bmatrix}$, then $A$ is a:",
    correctAnswer: "Diagonal matrix",
    wrongAnswers: ["Scalar matrix", "Identity matrix", "Skew-symmetric matrix"]
  },
  {
    question: "If $A = \\begin{bmatrix} 5 & 5 & 5 \\end{bmatrix}$, then $A$ is called a:",
    correctAnswer: "Row matrix",
    wrongAnswers: ["Column matrix", "Square matrix", "Scalar matrix"]
  },
  {
    question: "If $A = \\begin{bmatrix} 2 \\\\ 3 \\\\ 4 \\end{bmatrix}$, then $A$ is called a:",
    correctAnswer: "Column matrix",
    wrongAnswers: ["Row matrix", "Diagonal matrix", "Identity matrix"]
  },

  // ==========================================
  // MATRICES: MEDIUM (30 questions)
  // ==========================================
  {
    question: "If $A$ and $B$ are symmetric matrices of same order, then $AB + BA$ is a:",
    correctAnswer: "Symmetric matrix",
    wrongAnswers: ["Skew-symmetric matrix", "Diagonal matrix", "Null matrix"]
  },
  {
    question: "If $A = \\begin{bmatrix} a & b \\\\ c & -a \\end{bmatrix}$ is such that $A^2 = I$, then which of the following is true?",
    correctAnswer: "$1 - a^2 - bc = 0$",
    wrongAnswers: ["$1 + a^2 + bc = 0$", "$1 - a^2 + bc = 0$", "$1 + a^2 - bc = 0$"]
  },
  {
    question: "If a matrix is both symmetric and skew-symmetric, then it must be a:",
    correctAnswer: "Zero matrix",
    wrongAnswers: ["Diagonal matrix", "Identity matrix", "Triangular matrix"]
  },
  {
    question: "If $A$ is a square matrix of order 3 and $|A| = 5$, then the value of $|A'|$ is:",
    correctAnswer: "5",
    wrongAnswers: ["15", "125", "1/5"]
  },
  {
    question: "Let $A = \\begin{bmatrix} 1 & 2 \\\\ 0 & 1 \\end{bmatrix}$. Then $A^n$ for $n \\in \\mathbb{N}$ is equal to:",
    correctAnswer: "$\\begin{bmatrix} 1 & 2n \\\\ 0 & 1 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 1 & 2^n \\\\ 0 & 1 \\end{bmatrix}$",
      "$\\begin{bmatrix} n & 2n \\\\ 0 & n \\end{bmatrix}$",
      "$\\begin{bmatrix} 1 & n \\\\ 0 & 1 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A = \\begin{bmatrix} 0 & 1 \\\\ 1 & 0 \\end{bmatrix}$, then $A^4$ is equal to:",
    correctAnswer: "$\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 0 & 1 \\\\ 1 & 0 \\end{bmatrix}$",
      "$\\begin{bmatrix} 0 & 0 \\\\ 0 & 0 \\end{bmatrix}$",
      "$\\begin{bmatrix} 1 & 1 \\\\ 1 & 1 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A$ and $B$ are square matrices of order 3 such that $AB = O$, then:",
    correctAnswer: "It is not necessary that $A = O$ or $B = O$",
    wrongAnswers: [
      "$A = O$ and $B = O$",
      "either $A = O$ or $B = O$",
      "$A = B = I$"
    ]
  },
  {
    question: "If $A = \\begin{bmatrix} 3 & -4 \\\\ 1 & -1 \\end{bmatrix}$, then the value of $A^k$ is:",
    correctAnswer: "$\\begin{bmatrix} 1+2k & -4k \\\\ k & 1-2k \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 3^k & -4^k \\\\ 1 & -1 \\end{bmatrix}$",
      "$\\begin{bmatrix} 3k & -4k \\\\ k & -k \\end{bmatrix}$",
      "$\\begin{bmatrix} 1-2k & 4k \\\\ -k & 1+2k \\end{bmatrix}$"
    ]
  },
  {
    question: "For two matrices $A$ and $B$, $(AB)' = B'A'$ is known as the:",
    correctAnswer: "Reversal law of transposes",
    wrongAnswers: ["Associative law", "Commutative law", "Distributive law"]
  },
  {
    question: "If $A = \\begin{bmatrix} 2 & -1 \\\\ 3 & 4 \\end{bmatrix}$ and $B = \\begin{bmatrix} 5 & 2 \\\\ -3 & 0 \\end{bmatrix}$, then the product $AB$ is:",
    correctAnswer: "$\\begin{bmatrix} 13 & 4 \\\\ 3 & 6 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 10 & -2 \\\\ -9 & 0 \\end{bmatrix}$",
      "$\\begin{bmatrix} 13 & 6 \\\\ 4 & 3 \\end{bmatrix}$",
      "$\\begin{bmatrix} 16 & 4 \\\\ 3 & 8 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A$ is a square matrix of order 3, then $|kA|$ is equal to:",
    correctAnswer: "$k^3 |A|$",
    wrongAnswers: ["$k |A|$", "$k^2 |A|$", "$3k |A|$"]
  },
  {
    question: "Every square matrix $A$ can be uniquely expressed as the sum of a symmetric and a skew-symmetric matrix as:",
    correctAnswer: "$\\frac{1}{2}(A + A') + \\frac{1}{2}(A - A')$",
    wrongAnswers: [
      "$(A + A') + (A - A')$",
      "$\\frac{1}{2}(A + A') - \\frac{1}{2}(A - A')$",
      "$(A + A') - (A - A')$"
    ]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 3 \\\\ 2 & 1 \\end{bmatrix}$, find $A^2 - 2A - 5I$.",
    correctAnswer: "$\\begin{bmatrix} 0 & 0 \\\\ 0 & 0 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 1 & 2 \\\\ 3 & 1 \\end{bmatrix}$",
      "$\\begin{bmatrix} -5 & 0 \\\\ 0 & -5 \\end{bmatrix}$",
      "$\\begin{bmatrix} 2 & 6 \\\\ 4 & 2 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A$ is a square matrix of order $n$, and $I$ is the identity matrix of order $n$, then $AI = IA = $",
    correctAnswer: "$A$",
    wrongAnswers: ["$I$", "$O$", "$A^2$"]
  },
  {
    question: "If $A = \\begin{bmatrix} 0 & -i \\\\ i & 0 \\end{bmatrix}$ (where $i^2 = -1$), then $A^2$ is:",
    correctAnswer: "$\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} -1 & 0 \\\\ 0 & -1 \\end{bmatrix}$",
      "$\\begin{bmatrix} 0 & 1 \\\\ 1 & 0 \\end{bmatrix}$",
      "$\\begin{bmatrix} 0 & -1 \\\\ -1 & 0 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A$ is a square matrix, then the trace of $A$ (denoted by $\\text{tr}(A)$) is defined as:",
    correctAnswer: "The sum of the diagonal elements of $A$",
    wrongAnswers: [
      "The product of the diagonal elements of $A$",
      "The determinant of $A$",
      "The sum of all elements of $A$"
    ]
  },
  {
    question: "If $A$ and $B$ are square matrices of the same order, then trace of $AB$ is equal to:",
    correctAnswer: "trace of $BA$",
    wrongAnswers: ["trace of $A \\times$ trace of $B$", "trace of $A$ + trace of $B$", "none of these"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 5 \\\\ 6 & 7 \\end{bmatrix}$, then the symmetric part of $A$ is:",
    correctAnswer: "$\\begin{bmatrix} 1 & 11/2 \\\\ 11/2 & 7 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 0 & -1/2 \\\\ 1/2 & 0 \\end{bmatrix}$",
      "$\\begin{bmatrix} 1 & 6 \\\\ 5 & 7 \\end{bmatrix}$",
      "$\\begin{bmatrix} 2 & 11 \\\\ 11 & 14 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 5 \\\\ 6 & 7 \\end{bmatrix}$, then the skew-symmetric part of $A$ is:",
    correctAnswer: "$\\begin{bmatrix} 0 & -1/2 \\\\ 1/2 & 0 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 1 & 11/2 \\\\ 11/2 & 7 \\end{bmatrix}$",
      "$\\begin{bmatrix} 0 & -1 \\\\ 1 & 0 \\end{bmatrix}$",
      "$\\begin{bmatrix} 0 & 1/2 \\\\ -1/2 & 0 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A = \\begin{bmatrix} 2 & 3 \\\\ 5 & -2 \\end{bmatrix}$ is such that $A^{-1} = kA$, then the value of $k$ is:",
    correctAnswer: "$1/19$",
    wrongAnswers: ["$19$", "$1/11$", "$11$"]
  },
  {
    question: "If $A$ is a square matrix of order 3, and $|A| = 4$, then $|3A|$ is:",
    correctAnswer: "108",
    wrongAnswers: ["12", "36", "64"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 0 \\\\ 1 & 1 \\end{bmatrix}$ and $B = \\begin{bmatrix} 2 & 0 \\\\ 1 & 1 \\end{bmatrix}$, then the matrix $AB - BA$ is:",
    correctAnswer: "$\\begin{bmatrix} 0 & 0 \\\\ -1 & 0 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 0 & 0 \\\\ 1 & 0 \\end{bmatrix}$",
      "$\\begin{bmatrix} 0 & 0 \\\\ 0 & 0 \\end{bmatrix}$",
      "$\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A = \\begin{bmatrix} \\alpha & 0 \\\\ 1 & 1 \\end{bmatrix}$ and $B = \\begin{bmatrix} 1 & 0 \\\\ 5 & 1 \\end{bmatrix}$ are such that $A^2 = B$, then the value of $\\alpha$ is:",
    correctAnswer: "No real values of $\\alpha$",
    wrongAnswers: ["$1$", "$-1$", "$5$"]
  },
  {
    question: "If $A$ and $B$ are square matrices of order 3, then $|AB| = $",
    correctAnswer: "$|A||B|$",
    wrongAnswers: ["$|A| + |B|$", "$3|A||B|$", "$|A|^3|B|^3$"]
  },
  {
    question: "The transpose of a column matrix is a:",
    correctAnswer: "Row matrix",
    wrongAnswers: ["Column matrix", "Square matrix", "Diagonal matrix"]
  },
  {
    question: "If $A$ is a skew-symmetric matrix of odd order $n$, then $|A|$ is always:",
    correctAnswer: "0",
    wrongAnswers: ["1", "-1", "any non-zero real number"]
  },
  {
    question: "If $A = \\begin{bmatrix} 2 & 3 \\\\ 1 & 2 \\end{bmatrix}$ satisfies the equation $A^2 - 4A + kI = O$, then the value of $k$ is:",
    correctAnswer: "1",
    wrongAnswers: ["-1", "2", "0"]
  },
  {
    question: "If the trace of a matrix $A$ is 5 and the trace of a matrix $B$ is 7, then the trace of $2A + 3B$ is:",
    correctAnswer: "31",
    wrongAnswers: ["12", "24", "35"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$, then the value of $A - A'$ is:",
    correctAnswer: "$\\begin{bmatrix} 0 & -1 \\\\ 1 & 0 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 0 & 1 \\\\ -1 & 0 \\end{bmatrix}$",
      "$\\begin{bmatrix} 0 & 0 \\\\ 0 & 0 \\end{bmatrix}$",
      "$\\begin{bmatrix} 1 & -1 \\\\ 1 & 1 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A$ is a matrix of order $3 \\times 4$, then each row of $A$ contains:",
    correctAnswer: "4 elements",
    wrongAnswers: ["3 elements", "12 elements", "7 elements"]
  },

  // ==========================================
  // MATRICES: HARD (40 questions)
  // ==========================================
  {
    question: "If $A = \\begin{bmatrix} 3 & 3 & 3 \\\\ 3 & 3 & 3 \\\\ 3 & 3 & 3 \\end{bmatrix}$, then $A^3$ is equal to:",
    correctAnswer: "$81A$",
    wrongAnswers: ["$27A$", "$9A$", "$243A$"]
  },
  {
    question: "If $A$ is a square matrix of order 3 such that $A^2 = A$, and $B = I - A$, then $B^2$ is:",
    correctAnswer: "$I - A$",
    wrongAnswers: ["$I + A$", "$A$", "$I$"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 0 & 0 \\\\ 0 & 1 & 0 \\\\ a & b & -1 \\end{bmatrix}$, then $A^2$ is equal to:",
    correctAnswer: "$I$",
    wrongAnswers: ["$A$", "$-I$", "$O$"]
  },
  {
    question: "A square matrix $A$ is called orthogonal if:",
    correctAnswer: "$AA' = A'A = I$",
    wrongAnswers: ["$AA' = A^2$", "$A' = -A$", "$A' = A$"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 1 & 1 \\\\ 1 & 1 & 1 \\\\ 1 & 1 & 1 \\end{bmatrix}$, then $A^n$ for any $n \\in \\mathbb{N}$ is:",
    correctAnswer: "$3^{n-1} A$",
    wrongAnswers: ["$3^n A$", "$n A$", "$3n A$"]
  },
  {
    question: "If $A$ is a square matrix of order $n$ such that $A^2 - A + I = O$, then the inverse matrix $A^{-1}$ is equal to:",
    correctAnswer: "$I - A$",
    wrongAnswers: ["$A - I$", "$A + I$", "$A^2$"]
  },
  {
    question: "If $A$ and $B$ are invertible square matrices of the same order, then $(AB)^{-1}$ is equal to:",
    correctAnswer: "$B^{-1}A^{-1}$",
    wrongAnswers: ["$A^{-1}B^{-1}$", "$AB^{-1}$", "$A^{-1}B$"]
  },
  {
    question: "If $A$ is an invertible square matrix of order 3, and $|A| = 3$, then $|\\text{adj}(A)|$ is equal to:",
    correctAnswer: "9",
    wrongAnswers: ["3", "27", "1/3"]
  },
  {
    question: "If $A$ is an invertible square matrix of order $n$, then the determinant of $A^{-1}$ is equal to:",
    correctAnswer: "$1/|A|$",
    wrongAnswers: ["$|A|$", "$1$", "None of these"]
  },
  {
    question: "If $A$ is a square matrix of order 3 and $|A| = 2$, then the value of $|\\text{adj}(\\text{adj}(A))|$ is:",
    correctAnswer: "16",
    wrongAnswers: ["8", "4", "64"]
  },
  {
    question: "A square matrix $A$ is called nilpotent of index $k$ if:",
    correctAnswer: "$A^k = O$ and $A^{k-1} \\neq O$",
    wrongAnswers: ["$A^k = I$", "$A^k = -A$", "$A^2 = A$"]
  },
  {
    question: "A square matrix $A$ is called involuntary (involutary) if:",
    correctAnswer: "$A^2 = I$",
    wrongAnswers: ["$A^2 = A$", "$A^2 = O$", "$A' = -A$"]
  },
  {
    question: "A square matrix $A$ is called idempotent if:",
    correctAnswer: "$A^2 = A$",
    wrongAnswers: ["$A^2 = I$", "$A^2 = O$", "$A' = A$"]
  },
  {
    question: "If $A = \\begin{bmatrix} 2 & -2 & -4 \\\\ -1 & 3 & 4 \\\\ 1 & -2 & -3 \\end{bmatrix}$, then the matrix $A$ is:",
    correctAnswer: "Idempotent",
    wrongAnswers: ["Nilpotent", "Involutary", "Orthogonal"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & -3 & -4 \\\\ -1 & 3 & 4 \\\\ 1 & -3 & -4 \\end{bmatrix}$, then the matrix $A$ is:",
    correctAnswer: "Nilpotent of index 2",
    wrongAnswers: ["Nilpotent of index 3", "Idempotent", "Involutary"]
  },
  {
    question: "If $A$ is an orthogonal matrix, then the value of its determinant $|A|$ is always:",
    correctAnswer: "$\\pm 1$",
    wrongAnswers: ["$0$", "$1$", "$\\pm 2$"]
  },
  {
    question: "If $A = \\frac{1}{3} \\begin{bmatrix} 1 & 2 & 2 \\\\ 2 & 1 & -2 \\\\ -2 & 2 & -1 \\end{bmatrix}$, then the matrix $A$ is:",
    correctAnswer: "Orthogonal",
    wrongAnswers: ["Idempotent", "Nilpotent", "Involutary"]
  },
  {
    question: "If $A$ and $B$ are orthogonal matrices of the same order, then the product matrix $AB$ is:",
    correctAnswer: "Orthogonal",
    wrongAnswers: ["Symmetric", "Skew-symmetric", "Idempotent"]
  },
  {
    question: "If $A$ is a square matrix of order 3, and $|A| = d$, then $|\\text{adj}(2A)|$ is equal to:",
    correctAnswer: "$64d^2$",
    wrongAnswers: ["$8d^2$", "$16d^2$", "$4d^2$"]
  },
  {
    question: "If $A$ and $B$ are square matrices of the same order, then trace of $A(BC)$ is equal to:",
    correctAnswer: "trace of $(BC)A$",
    wrongAnswers: ["trace of $B(AC)$", "trace of $C(AB)$", "both trace of $(BC)A$ and trace of $C(AB)$"]
  },
  {
    question: "If $A$ is a square matrix of order $n$, then $|\\text{adj}(A)| = $",
    correctAnswer: "$|A|^{n-1}$",
    wrongAnswers: ["$|A|^n$", "$|A|^{n-2}$", "$n|A|^{n-1}$"]
  },
  {
    question: "If $A$ is an invertible square matrix of order $n$, and $k$ is a non-zero scalar, then $(kA)^{-1}$ is equal to:",
    correctAnswer: "$\\frac{1}{k} A^{-1}$",
    wrongAnswers: ["$k A^{-1}$", "$k^n A^{-1}$", "$\\frac{1}{k^n} A^{-1}$"]
  },
  {
    question: "If $A$ and $B$ are symmetric matrices of order $n$ such that $AB = BA$, then the product $AB$ is a:",
    correctAnswer: "Symmetric matrix",
    wrongAnswers: ["Skew-symmetric matrix", "Diagonal matrix", "Identity matrix"]
  },
  {
    question: "If $A = \\begin{bmatrix} i & 0 \\\\ 0 & i \\end{bmatrix}$ (where $i = \\sqrt{-1}$), then $A^{4n}$ for any $n \\in \\mathbb{N}$ is:",
    correctAnswer: "$I$",
    wrongAnswers: ["$-I$", "$iI$", "$-iI$"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & a \\\\ 0 & 1 \\end{bmatrix}$, then $A^n - (n-1)A$ is equal to:",
    correctAnswer: "$\\begin{bmatrix} 2-n & a \\\\ 0 & 2-n \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 1 & na \\\\ 0 & 1 \\end{bmatrix}$",
      "$\\begin{bmatrix} 1-n & a \\\\ 0 & 1-n \\end{bmatrix}$",
      "$\\begin{bmatrix} 2-n & na \\\\ 0 & 2-n \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A = \\begin{bmatrix} \\cos 2\\theta & \\sin 2\\theta \\\\ -\\sin 2\\theta & \\cos 2\\theta \\end{bmatrix}$, then $A^n$ is equal to:",
    correctAnswer: "$\\begin{bmatrix} \\cos 2n\\theta & \\sin 2n\\theta \\\\ -\\sin 2n\\theta & \\cos 2n\\theta \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} \\cos^n 2\\theta & \\sin^n 2\\theta \\\\ -\\sin^n 2\\theta & \\cos^n 2\\theta \\end{bmatrix}$",
      "$\\begin{bmatrix} n\\cos 2\\theta & n\\sin 2\\theta \\\\ -n\\sin 2\\theta & n\\cos 2\\theta \\end{bmatrix}$",
      "$\\begin{bmatrix} \\cos 2\\theta^n & \\sin 2\\theta^n \\\\ -\\sin 2\\theta^n & \\cos 2\\theta^n \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A$ is a square matrix of order 3, and $|A| = 3$, then $|A \\cdot \\text{adj}(A)|$ is equal to:",
    correctAnswer: "27",
    wrongAnswers: ["9", "81", "3"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & -1 & 1 \\\\ 2 & -1 & 0 \\\\ 1 & 0 & 0 \\end{bmatrix}$, then $A^{-1}$ is equal to:",
    correctAnswer: "$A^2$",
    wrongAnswers: ["$A$", "$A^3$", "$I$"]
  },
  {
    question: "If $A$ is a skew-symmetric matrix of order $n$, then $A^2$ is a:",
    correctAnswer: "Symmetric matrix",
    wrongAnswers: ["Skew-symmetric matrix", "Diagonal matrix", "Null matrix"]
  },
  {
    question: "If $A$ is a skew-symmetric matrix of order $n$, then $A^3$ is a:",
    correctAnswer: "Skew-symmetric matrix",
    wrongAnswers: ["Symmetric matrix", "Diagonal matrix", "Null matrix"]
  },
  {
    question: "If $A$ is a square matrix, and $A^T$ is its transpose, then trace of $A A^T$ is:",
    correctAnswer: "The sum of the squares of all elements of $A$",
    wrongAnswers: [
      "The square of the trace of $A$",
      "The sum of the squares of the diagonal elements of $A$",
      "The determinant of $A A^T$"
    ]
  },
  {
    question: "If $A$ and $B$ are square matrices of the same order, and $A$ is symmetric, then $B'AB$ is always a:",
    correctAnswer: "Symmetric matrix",
    wrongAnswers: ["Skew-symmetric matrix", "Diagonal matrix", "Orthogonal matrix"]
  },
  {
    question: "If $A$ and $B$ are square matrices of the same order, and $A$ is skew-symmetric, then $B'AB$ is always a:",
    correctAnswer: "Skew-symmetric matrix",
    wrongAnswers: ["Symmetric matrix", "Diagonal matrix", "Orthogonal matrix"]
  },
  {
    question: "If $A$ is a square matrix such that $A^3 = I$, then $A^{-1}$ is equal to:",
    correctAnswer: "$A^2$",
    wrongAnswers: ["$A$", "$I$", "$A^3$"]
  },
  {
    question: "If $A = \\begin{bmatrix} e^t & e^{-t} \\cos t & e^{-t} \\sin t \\\\ e^t & -e^{-t}(\\cos t + \\sin t) & e^{-t}(\\cos t - \\sin t) \\\\ e^t & 2e^{-t} \\sin t & -2e^{-t} \\cos t \\end{bmatrix}$, then the matrix $A$ is:",
    correctAnswer: "Invertible for all real values of $t$",
    wrongAnswers: [
      "Invertible only for $t = 0$",
      "Invertible only for positive values of $t$",
      "Not invertible for any real value of $t$"
    ]
  },
  {
    question: "If $A$ is a square matrix of order 3, and $|A| = 3$, then trace of $(\\text{adj}(A))$ is not uniquely determined, but $|\\text{adj}(3A)|$ is equal to:",
    correctAnswer: "729",
    wrongAnswers: ["243", "81", "27"]
  },
  {
    question: "If $A$ is a square matrix such that $A^2 - A + I = O$, then the value of $A^5$ is:",
    correctAnswer: "$-A - I$ or $-A^{-1}$",
    wrongAnswers: ["$A$", "$I$", "$A + I$"]
  },
  {
    question: "If $A$ is a square matrix of order 3 such that $|A| = 2$, then $|\\text{adj}(3A)|$ is equal to:",
    correctAnswer: "324",
    wrongAnswers: ["162", "18", "108"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$, and $A^2 - 5A - 2I = O$, then $A^{-1}$ is equal to:",
    correctAnswer: "$\\frac{1}{2}(A - 5I)$",
    wrongAnswers: [
      "$\\frac{1}{2}(A + 5I)$",
      "$2(A - 5I)$",
      "$2(A + 5I)$"
    ]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & -1 \\\\ 2 & -1 \\end{bmatrix}$ and $B = \\begin{bmatrix} a & 1 \\\\ b & -1 \\end{bmatrix}$ are such that $(A+B)^2 = A^2 + B^2$, then the values of $a$ and $b$ are:",
    correctAnswer: "$a = 1, b = 4$",
    wrongAnswers: [
      "$a = 2, b = 3$",
      "$a = 1, b = 2$",
      "$a = 0, b = 4$"
    ]
  }
];

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
  console.log('Connected to Database. Seeding Class 12 Matrices chapter...');

  // Find class No 12
  const classDoc = await Class.findOne({ classId: 12 });
  if (!classDoc) {
    console.error('Class 12 not found in classes collection!');
    process.exit(1);
  }
  const classId = classDoc._id;

  // Find or create chapter "Matrices"
  const { normalizeChapterName } = require('../utils/chapterNormalization');
  const normalized = normalizeChapterName('Matrices');
  let chapterDoc = await Chapter.findOne({ classId, normalizedChapterName: normalized });
  if (!chapterDoc) {
    console.log('Chapter "Matrices" not found. Creating it...');
    chapterDoc = await Chapter.create({
      classId: classId,
      chapterName: 'Matrices',
    });
  }
  const chapterId = chapterDoc._id;

  console.log(`Using classId: ${classId} ("Class 12")`);
  console.log(`Matrices chapterId: ${chapterId}`);

  let addedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < matricesQuestions.length; i++) {
    const qData = matricesQuestions[i];

    // Combine correct and wrong answers, then shuffle them
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
        console.error(`Error saving Matrices question ${i + 1}: ${err.message}`);
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
