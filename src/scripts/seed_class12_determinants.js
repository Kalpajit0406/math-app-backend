/**
 * Seeding script to add 100 questions in Determinants chapter for Class 12.
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

const determinantsQuestions = [
  // ==========================================
  // DETERMINANTS: EASY (30 questions)
  // ==========================================
  {
    question: "Evaluate the determinant: $\\begin{vmatrix} 2 & 4 \\\\ -5 & -1 \\end{vmatrix}$.",
    correctAnswer: "18",
    wrongAnswers: ["-22", "22", "-18"]
  },
  {
    question: "Evaluate the determinant: $\\begin{vmatrix} x & x+1 \\\\ x-1 & x \\end{vmatrix}$.",
    correctAnswer: "1",
    wrongAnswers: ["$x^2$", "$2x^2 - 1$", "-1"]
  },
  {
    question: "Find the values of $x$ for which $\\begin{vmatrix} 3 & x \\\\ x & 1 \\end{vmatrix} = \\begin{vmatrix} 3 & 2 \\\\ 4 & 1 \\end{vmatrix}$.",
    correctAnswer: "$\\pm 2\\sqrt{2}$",
    wrongAnswers: ["$\\pm 2$", "$\\pm 4$", "$\\pm 8$"]
  },
  {
    question: "Find the values of $x$ if $\\begin{vmatrix} 2 & 4 \\\\ 5 & 1 \\end{vmatrix} = \\begin{vmatrix} 2x & 4 \\\\ 6 & x \\end{vmatrix}$.",
    correctAnswer: "$\\pm \\sqrt{3}$",
    wrongAnswers: ["$\\pm 3$", "$\\pm 2\\sqrt{2}$", "$\\pm 6$"]
  },
  {
    question: "Find the minor of the element 6 in the determinant $\\begin{vmatrix} 1 & 2 & 3 \\\\ 4 & 5 & 6 \\\\ 7 & 8 & 9 \\end{vmatrix}$.",
    correctAnswer: "-6",
    wrongAnswers: ["6", "-12", "12"]
  },
  {
    question: "Find the cofactor of the element $a_{21}$ in the determinant $\\begin{vmatrix} 5 & 3 & 8 \\\\ 2 & 0 & 1 \\\\ 1 & 2 & 3 \\end{vmatrix}$.",
    correctAnswer: "7",
    wrongAnswers: ["-7", "11", "-11"]
  },
  {
    question: "Find the area of the triangle whose vertices are $(3, 8), (-4, 2),$ and $(5, 1)$ using determinants.",
    correctAnswer: "30.5 sq. units",
    wrongAnswers: ["61 sq. units", "15 sq. units", "35 sq. units"]
  },
  {
    question: "If the area of a triangle is 35 sq. units with vertices $(2, -6), (5, 4),$ and $(k, 4)$, then find the value of $k$.",
    correctAnswer: "$12$ or $-2$",
    wrongAnswers: ["$12$", "$-2$", "$-12$ or $2$"]
  },
  {
    question: "Find the equation of the line joining $(1, 2)$ and $(3, 6)$ using determinants.",
    correctAnswer: "$y = 2x$",
    wrongAnswers: ["$y = x$", "$2y = x$", "$y = 3x$"]
  },
  {
    question: "A determinant of order $3 \\times 3$ is defined for:",
    correctAnswer: "Square matrices only",
    wrongAnswers: ["Rectangular matrices only", "Any matrix", "Vectors only"]
  },
  {
    question: "Evaluate the determinant: $\\begin{vmatrix} \\cos \\theta & -\\sin \\theta \\\\ \\sin \\theta & \\cos \\theta \\end{vmatrix}$.",
    correctAnswer: "1",
    wrongAnswers: ["$\\cos 2\\theta$", "0", "-1"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 2 \\\\ 4 & 2 \\end{bmatrix}$, then $|2A|$ is equal to:",
    correctAnswer: "$4|A|$",
    wrongAnswers: ["$2|A|$", "$8|A|$", "$16|A|$"]
  },
  {
    question: "Evaluate the determinant: $\\begin{vmatrix} 0 & \sin \\alpha & -\\cos \\alpha \\\\ -\\sin \\alpha & 0 & \\sin \\beta \\\\ \\cos \\alpha & -\\sin \\beta & 0 \\end{vmatrix}$.",
    correctAnswer: "0",
    wrongAnswers: ["1", "$\\sin \\alpha \\cos \\beta$", "-1"]
  },
  {
    question: "Find the minor of the element $a_{12}$ in the determinant $\\begin{vmatrix} 2 & -3 & 5 \\\\ 6 & 0 & 4 \\\\ 1 & 5 & -7 \\end{vmatrix}$.",
    correctAnswer: "-46",
    wrongAnswers: ["46", "-38", "38"]
  },
  {
    question: "Find the cofactor of the element $a_{32}$ in the determinant $\\begin{vmatrix} 1 & 0 & 4 \\\\ 3 & 5 & -1 \\\\ 0 & 1 & 2 \\end{vmatrix}$.",
    correctAnswer: "13",
    wrongAnswers: ["-13", "11", "-11"]
  },
  {
    question: "If vertices of a triangle are $(1, 0), (6, 0),$ and $(4, 3)$, then its area using determinants is:",
    correctAnswer: "7.5 sq. units",
    wrongAnswers: ["15 sq. units", "5 sq. units", "10 sq. units"]
  },
  {
    question: "If the points $(a, 0), (0, b),$ and $(1, 1)$ are collinear, then using determinants, we can prove that:",
    correctAnswer: "$\\frac{1}{a} + \\frac{1}{b} = 1$",
    wrongAnswers: ["$a + b = 1$", "$ab = 1$", "$\\frac{1}{a} - \\frac{1}{b} = 1$"]
  },
  {
    question: "Find the value of $x$ if the points $(x, -1), (2, 1),$ and $(4, 5)$ are collinear.",
    correctAnswer: "1",
    wrongAnswers: ["2", "0", "-1"]
  },
  {
    question: "The value of a determinant is zero if:",
    correctAnswer: "Any two rows or columns are identical",
    wrongAnswers: [
      "All diagonal elements are zero",
      "All non-diagonal elements are zero",
      "The matrix is an identity matrix"
    ]
  },
  {
    question: "Find the determinant of the matrix $A = \\begin{bmatrix} 2 & 0 \\\\ 0 & 5 \\end{bmatrix}$.",
    correctAnswer: "10",
    wrongAnswers: ["7", "0", "1/10"]
  },
  {
    question: "Find the determinant of the matrix $A = \\begin{bmatrix} 1 & 2 & 3 \\\\ 0 & 4 & 5 \\\\ 0 & 0 & 6 \\end{bmatrix}$.",
    correctAnswer: "24",
    wrongAnswers: ["0", "15", "10"]
  },
  {
    question: "If $A$ is a square matrix of order 3, and $|A| = -2$, then the determinant of the transpose matrix $|A'|$ is:",
    correctAnswer: "-2",
    wrongAnswers: ["2", "8", "-8"]
  },
  {
    question: "For any square matrix $A$, the determinant value remains unchanged if:",
    correctAnswer: "Rows and columns are interchanged",
    wrongAnswers: [
      "Any two rows are interchanged",
      "All elements are multiplied by a constant $k$",
      "None of these"
    ]
  },
  {
    question: "If $|A| = 0$, then the matrix $A$ is called a:",
    correctAnswer: "Singular matrix",
    wrongAnswers: ["Non-singular matrix", "Symmetric matrix", "Skew-symmetric matrix"]
  },
  {
    question: "If $|A| \\neq 0$, then the matrix $A$ is called a:",
    correctAnswer: "Non-singular matrix",
    wrongAnswers: ["Singular matrix", "Zero matrix", "None of these"]
  },
  {
    question: "Find the determinant of a $3 \\times 3$ identity matrix $I$.",
    correctAnswer: "1",
    wrongAnswers: ["3", "0", "9"]
  },
  {
    question: "Evaluate the determinant: $\\begin{vmatrix} 100 & 101 \\\\ 99 & 100 \\end{vmatrix}$.",
    correctAnswer: "1",
    wrongAnswers: ["0", "199", "9900"]
  },
  {
    question: "Evaluate the determinant: $\\begin{vmatrix} a+ib & c+id \\\\ -c+id & a-ib \\end{vmatrix}$ (where $i^2 = -1$).",
    correctAnswer: "$a^2 + b^2 + c^2 + d^2$",
    wrongAnswers: [
      "$a^2 - b^2 + c^2 - d^2$",
      "$a^2 + b^2 - c^2 - d^2$",
      "$a^2 - b^2 - c^2 - d^2$"
    ]
  },
  {
    question: "Find the minor of element $a_{22}$ in the determinant $\\begin{vmatrix} 3 & 4 \\\\ 1 & 2 \\end{vmatrix}$.",
    correctAnswer: "3",
    wrongAnswers: ["2", "4", "1"]
  },
  {
    question: "If the determinant $\\begin{vmatrix} x & 8 \\\\ 2 & x \\end{vmatrix} = 0$, find the positive value of $x$.",
    correctAnswer: "4",
    wrongAnswers: ["16", "2", "8"]
  },

  // ==========================================
  // DETERMINANTS: MEDIUM (30 questions)
  // ==========================================
  {
    question: "If $A$ is a square matrix of order 3, and $|A| = 3$, find the value of $|A^2|$.",
    correctAnswer: "9",
    wrongAnswers: ["6", "27", "3"]
  },
  {
    question: "If $A$ and $B$ are square matrices of order 3 such that $|A| = -1$ and $|B| = 3$, find $|AB|$.",
    correctAnswer: "-3",
    wrongAnswers: ["3", "-1/3", "2"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 5 \\end{bmatrix}$, find $|A \\cdot \\text{adj}(A)|$.",
    correctAnswer: "1",
    wrongAnswers: ["-1", "0", "5"]
  },
  {
    question: "If $A = \\begin{bmatrix} 2 & 3 \\\\ 1 & 4 \\end{bmatrix}$, then the adjoint matrix $\\text{adj}(A)$ is:",
    correctAnswer: "$\\begin{bmatrix} 4 & -3 \\\\ -1 & 2 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 4 & -1 \\\\ -3 & 2 \\end{bmatrix}$",
      "$\\begin{bmatrix} 2 & -3 \\\\ -1 & 4 \\end{bmatrix}$",
      "$\\begin{bmatrix} -4 & 3 \\\\ 1 & -2 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A$ is a non-singular square matrix of order 3 such that $|A| = 4$, then find the value of $|\\text{adj}(A)|$.",
    correctAnswer: "16",
    wrongAnswers: ["4", "64", "12"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$, then the inverse matrix $A^{-1}$ is:",
    correctAnswer: "$-\\frac{1}{2} \\begin{bmatrix} 4 & -2 \\\\ -3 & 1 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\frac{1}{2} \\begin{bmatrix} 4 & -2 \\\\ -3 & 1 \\end{bmatrix}$",
      "$-\\frac{1}{2} \\begin{bmatrix} 1 & -2 \\\\ -3 & 4 \\end{bmatrix}$",
      "$\\begin{bmatrix} 4 & -2 \\\\ -3 & 1 \\end{bmatrix}$"
    ]
  },
  {
    question: "If $A$ is a square matrix of order 3 and $|A| = 5$, then find the value of $|A^{-1}|$.",
    correctAnswer: "1/5",
    wrongAnswers: ["5", "25", "1/25"]
  },
  {
    question: "Let $A$ be a square matrix of order 3. If $|A| = k$, then $|\\text{adj}(A)|$ is equal to:",
    correctAnswer: "$k^2$",
    wrongAnswers: ["$k$", "$k^3$", "$3k$"]
  },
  {
    question: "Evaluate the determinant without expansion: $\\begin{vmatrix} 41 & 1 & 5 \\\\ 79 & 7 & 9 \\\\ 29 & 5 & 3 \\end{vmatrix}$.",
    correctAnswer: "0",
    wrongAnswers: ["15", "-10", "42"]
  },
  {
    question: "Evaluate the determinant: $\\begin{vmatrix} 1 & a & b+c \\\\ 1 & b & c+a \\\\ 1 & c & a+b \\end{vmatrix}$.",
    correctAnswer: "0",
    wrongAnswers: ["$a+b+c$", "$abc$", "1"]
  },
  {
    question: "Evaluate the determinant: $\\begin{vmatrix} b+c & a & a \\\\ b & c+a & b \\\\ c & c & a+b \\end{vmatrix}$.",
    correctAnswer: "$4abc$",
    wrongAnswers: ["$abc$", "$2abc$", "0"]
  },
  {
    question: "Find the values of $a$ and $b$ for which the system of equations $x+y=2$ and $2x+2y=4$ is:",
    correctAnswer: "Consistent with infinitely many solutions",
    wrongAnswers: [
      "Inconsistent with no solution",
      "Consistent with a unique solution",
      "None of these"
    ]
  },
  {
    question: "For a system of equations $AX = B$, if $|A| = 0$ and $(\\text{adj } A)B = O$, then the system is:",
    correctAnswer: "Either consistent (infinite solutions) or inconsistent",
    wrongAnswers: [
      "Strictly inconsistent (no solution)",
      "Strictly consistent with unique solution",
      "None of these"
    ]
  },
  {
    question: "For a system of linear equations $AX = B$, if $|A| \\neq 0$, then the system has:",
    correctAnswer: "A unique solution given by $X = A^{-1}B$",
    wrongAnswers: [
      "Infinitely many solutions",
      "No solution",
      "A unique solution given by $X = BA^{-1}$"
    ]
  },
  {
    question: "If $A = \\begin{bmatrix} 2 & -3 \\\\ 3 & 4 \\end{bmatrix}$, then the value of $A^2 - 6A + 17I$ is:",
    correctAnswer: "$O$ (Zero matrix)",
    wrongAnswers: [
      "$I$ (Identity matrix)",
      "$\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}$",
      "$\\begin{bmatrix} 2 & 2 \\\\ 2 & 2 \\end{bmatrix}$"
    ]
  },
  {
    question: "Find the determinant of the matrix $A = \\begin{bmatrix} 1 & a & a^2 \\\\ 1 & b & b^2 \\\\ 1 & c & c^2 \\end{bmatrix}$.",
    correctAnswer: "$(a-b)(b-c)(c-a)$",
    wrongAnswers: [
      "$(a+b)(b+c)(c+a)$",
      "$(a-b)(b-c)(a-c)$",
      "$(b-a)(c-b)(c-a)$"
    ]
  },
  {
    question: "Evaluate the determinant: $\\begin{vmatrix} x+y & y+z & z+x \\\\ z & x & y \\\\ 1 & 1 & 1 \\end{vmatrix}$.",
    correctAnswer: "0",
    wrongAnswers: ["$x+y+z$", "1", "$xy+yz+zx$"]
  },
  {
    question: "If $A$ and $B$ are non-singular square matrices of order 3, which of the following is correct?",
    correctAnswer: "$\\text{adj}(AB) = (\\text{adj } B)(\\text{adj } A)$",
    wrongAnswers: [
      "$\\text{adj}(AB) = (\\text{adj } A)(\\text{adj } B)$",
      "$(AB)^{-1} = A^{-1}B^{-1}$",
      "None of these"
    ]
  },
  {
    question: "If $A$ is a square matrix of order 3, and $|A| = 2$, then $|\\text{adj}(3A)|$ is equal to:",
    correctAnswer: "324",
    wrongAnswers: ["162", "18", "108"]
  },
  {
    question: "The value of determinant $\\begin{vmatrix} 1 & 1 & 1 \\\\ a & b & c \\\\ b+c & c+a & a+b \\end{vmatrix}$ is:",
    correctAnswer: "0",
    wrongAnswers: ["$a+b+c$", "$ab+bc+ca$", "1"]
  },
  {
    question: "If $A = \\begin{bmatrix} 0 & 3 \\\\ 2 & 0 \\end{bmatrix}$ and $A^{-1} = \\lambda \\text{adj}(A)$, then the value of $\\lambda$ is:",
    correctAnswer: "-1/6",
    wrongAnswers: ["1/6", "-6", "6"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$, then the value of $A \\cdot A^{-1}$ is:",
    correctAnswer: "$\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$",
      "$\\begin{bmatrix} 0 & 0 \\\\ 0 & 0 \\end{bmatrix}$",
      "$\\begin{bmatrix} 4 & 2 \\\\ 3 & 1 \\end{bmatrix}$"
    ]
  },
  {
    question: "If the determinant $\\begin{vmatrix} x+1 & 3 & 5 \\\\ 2 & x+2 & 5 \\\\ 2 & 3 & x+5 \\end{vmatrix} = 0$, then the roots are:",
    correctAnswer: "$0, -9$",
    wrongAnswers: ["$0, 9$", "$1, -9$", "$1, 9$"]
  },
  {
    question: "For what value of $k$ does the system of equations $2x + 3y = 5$ and $4x + ky = 10$ have infinitely many solutions?",
    correctAnswer: "6",
    wrongAnswers: ["3", "12", "0"]
  },
  {
    question: "If $A$ is a square matrix of order 3, and $|A| = d$, then $|\\text{adj}(2A)|$ is equal to:",
    correctAnswer: "$64d^2$",
    wrongAnswers: ["$8d^2$", "$16d^2$", "$4d^2$"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & -1 & 1 \\\\ 2 & -1 & 0 \\\\ 1 & 0 & 0 \\end{bmatrix}$, then $A^{-1}$ is equal to:",
    correctAnswer: "$A^2$",
    wrongAnswers: ["$A$", "$A^3$", "$I$"]
  },
  {
    question: "Evaluate the determinant: $\\begin{vmatrix} 1^2 & 2^2 & 3^2 \\\\ 2^2 & 3^2 & 4^2 \\\\ 3^2 & 4^2 & 5^2 \\end{vmatrix}$.",
    correctAnswer: "-8",
    wrongAnswers: ["8", "0", "-16"]
  },
  {
    question: "If $A$ is a skew-symmetric matrix of order $n$, and $n$ is odd, then the determinant $|A|$ is:",
    correctAnswer: "0",
    wrongAnswers: ["1", "-1", "$n$"]
  },
  {
    question: "If the area of a triangle with vertices $(2, -6), (5, 4),$ and $(k, 4)$ is 35 sq. units, find the value of $k$.",
    correctAnswer: "$12$ or $-2$",
    wrongAnswers: ["$12$", "$-2$", "$-12$ or $2$"]
  },
  {
    question: "If the determinant $\\begin{vmatrix} 1 & 4 & 20 \\\\ 1 & -2 & 5 \\\\ 1 & 2x & 5x^2 \\end{vmatrix} = 0$, then the roots for $x$ are:",
    correctAnswer: "$-1, 2/5$",
    wrongAnswers: ["$1, -2/5$", "$-1, -2/5$", "$1, 2/5$"]
  },

  // ==========================================
  // DETERMINANTS: HARD (40 questions)
  // ==========================================
  {
    question: "If $A$ and $B$ are square matrices of order 3 such that $|A| = 2$ and $|B| = -3$, then the determinant of the matrix $2A'B^{-1}$ is:",
    correctAnswer: "-16/3",
    wrongAnswers: ["-8/3", "16/3", "-16"]
  },
  {
    question: "If $A$ is a square matrix of order 3 such that $|A| = 4$, then $|\\text{adj}(\\text{adj } A)|$ is:",
    correctAnswer: "256",
    wrongAnswers: ["16", "64", "1024"]
  },
  {
    question: "For a system of linear equations $AX = B$, if $|A| = 0$ and $(\\text{adj } A)B \\neq O$, then the system is:",
    correctAnswer: "Inconsistent (no solution)",
    wrongAnswers: [
      "Consistent (infinitely many solutions)",
      "Consistent with unique solution",
      "None of these"
    ]
  },
  {
    question: "Let $A$ be a square matrix of order 3. If $|A| = 2$, then the determinant value of $|\\text{adj}(2A)|$ is:",
    correctAnswer: "256",
    wrongAnswers: ["64", "128", "512"]
  },
  {
    question: "If $A = \\begin{bmatrix} a & b & c \\\\ b & c & a \\\\ c & a & b \\end{bmatrix}$ is orthogonal, and $a, b, c$ are positive real numbers such that $abc = 1$, then $a^3 + b^3 + c^3$ is:",
    correctAnswer: "4",
    wrongAnswers: ["3", "1", "0"]
  },
  {
    question: "Solve the system of equations using matrix method: $2x + 3y + 3z = 5$, $x - 2y + z = -4$, $3x - y - 2z = 3$. Find the value of $x + y + z$.",
    correctAnswer: "5",
    wrongAnswers: ["3", "1", "0"]
  },
  {
    question: "If $A$ is an invertible matrix of order $n$, then $|\\text{adj}(A^{-1})| = $",
    correctAnswer: "$|A|^{1-n}$",
    wrongAnswers: ["$|A|^{n-1}$", "$|A|^{-n}$", "$|A|^n$"]
  },
  {
    question: "If the system of equations $x + y + z = 6$, $x + 2y + 3z = 10$, $x + 2y + \\lambda z = \\mu$ has infinitely many solutions, then:",
    correctAnswer: "$\\lambda = 3, \\mu = 10$",
    wrongAnswers: [
      "$\\lambda = 3, \\mu \\neq 10$",
      "$\\lambda \\neq 3, \\mu = 10$",
      "$\\lambda \\neq 3, \\mu \\neq 10$"
    ]
  },
  {
    question: "If the system of equations $x + y + z = 6$, $x + 2y + 3z = 10$, $x + 2y + \\lambda z = \\mu$ has no solution, then:",
    correctAnswer: "$\\lambda = 3, \\mu \\neq 10$",
    wrongAnswers: [
      "$\\lambda = 3, \\mu = 10$",
      "$\\lambda \\neq 3, \\mu = 10$",
      "$\\lambda \\neq 3, \\mu \\neq 10$"
    ]
  },
  {
    question: "If the system of equations $x + y + z = 6$, $x + 2y + 3z = 10$, $x + 2y + \\lambda z = \\mu$ has a unique solution, then:",
    correctAnswer: "$\\lambda \\neq 3$, for any real $\\mu$",
    wrongAnswers: [
      "$\\lambda = 3, \\mu = 10$",
      "$\\lambda = 3, \\mu \\neq 10$",
      "$\\lambda \\neq 3, \\mu = 10$"
    ]
  },
  {
    question: "If $A$ is a square matrix of order 3 and $A^T A = I$, then $|A^2 - I|$ is equal to:",
    correctAnswer: "0",
    wrongAnswers: ["1", "-1", "none of these"]
  },
  {
    question: "If $a, b, c$ are distinct real numbers, then the system of equations $ax + y + z = 0$, $x + by + z = 0$, $x + y + cz = 0$ has a non-trivial solution if:",
    correctAnswer: "$\\frac{1}{1-a} + \\frac{1}{1-b} + \\frac{1}{1-c} = 1$ (for $a, b, c \\neq 1$)",
    wrongAnswers: [
      "$a + b + c = 1$",
      "$abc = 1$",
      "$\\frac{1}{1-a} + \\frac{1}{1-b} + \\frac{1}{1-c} = 0$"
    ]
  },
  {
    question: "If $f(x) = \\begin{vmatrix} x & 2 & 3 \\\\ 1 & x & 1 \\\\ 3 & 2 & x \\end{vmatrix}$, then find the coefficient of $x^2$ in the expansion of $f(x)$.",
    correctAnswer: "0",
    wrongAnswers: ["-4", "4", "3"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & -1 & 1 \\\\ 2 & 1 & -3 \\\\ 1 & 1 & 1 \\end{bmatrix}$, find $|A|$. Also, find the determinant of its inverse $|A^{-1}|$.",
    correctAnswer: "$|A| = 6$, $|A^{-1}| = 1/6$",
    wrongAnswers: [
      "$|A| = 6$, $|A^{-1}| = -6$",
      "$|A| = 12$, $|A^{-1}| = 1/12$",
      "$|A| = 0$, $|A^{-1}|$ does not exist"
    ]
  },
  {
    question: "If $\\omega$ is a complex cube root of unity, then the value of determinant $\\begin{vmatrix} 1 & \\omega & \\omega^2 \\\\ \\omega & \\omega^2 & 1 \\\\ \\omega^2 & 1 & \\omega \\end{vmatrix}$ is:",
    correctAnswer: "0",
    wrongAnswers: ["1", "$\\omega$", "$\\omega^2$"]
  },
  {
    question: "The value of determinant $\\begin{vmatrix} 1 & a & a^2 - bc \\\\ 1 & b & b^2 - ca \\\\ 1 & c & c^2 - ab \\end{vmatrix}$ is:",
    correctAnswer: "0",
    wrongAnswers: ["$(a-b)(b-c)(c-a)$", "$a^2+b^2+c^2$", "$abc$"]
  },
  {
    question: "Find the values of $a$ for which the system of equations $ax + y + z = 1$, $x + ay + z = 1$, $x + y + az = 1$ is inconsistent.",
    correctAnswer: "$a = -2$",
    wrongAnswers: ["$a = 1$", "$a = -2$ or $a = 1$", "No such value of $a$"]
  },
  {
    question: "Let $A$ be a square matrix of order 3. If $|A| = 5$, then the determinant of the matrix $-2A$ is:",
    correctAnswer: "-40",
    wrongAnswers: ["-10", "40", "-20"]
  },
  {
    question: "If $A$ is a square matrix of order 3 such that $A^3 + 3A^2 - A + I = O$, then the inverse matrix $A^{-1}$ is:",
    correctAnswer: "$-A^2 - 3A + I$",
    wrongAnswers: ["$A^2 + 3A - I$", "$-A^2 - 3A - I$", "$A^2 + 3A + I$"]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$, then the value of $|A^T A^{-1}|$ is:",
    correctAnswer: "1",
    wrongAnswers: ["-1", "2", "-2"]
  },
  {
    question: "If $a, b, c$ are in A.P., then the value of the determinant $\\begin{vmatrix} x+1 & x+2 & x+a \\\\ x+2 & x+3 & x+b \\\\ x+3 & x+4 & x+c \\end{vmatrix}$ is:",
    correctAnswer: "0",
    wrongAnswers: ["1", "$x$", "$a+b+c$"]
  },
  {
    question: "If $a, b, c$ are the $p$-th, $q$-th, and $r$-th terms of a G.P., then the value of the determinant $\\begin{vmatrix} \\log a & p & 1 \\\\ \\log b & q & 1 \\\\ \\log c & r & 1 \\end{vmatrix}$ is:",
    correctAnswer: "0",
    wrongAnswers: ["1", "$pqr$", "$\\log(abc)$"]
  },
  {
    question: "If $A$ is a square matrix of order 3 such that $A^2 - 5A + 7I = O$, then $A^5$ is equal to:",
    correctAnswer: "$149A - 532I$",
    wrongAnswers: ["$25A - 35I$", "$149A + 532I$", "$25A + 35I$"]
  },
  {
    question: "If the determinant $\\begin{vmatrix} a & a^2 & a^3-1 \\\\ b & b^2 & b^3-1 \\\\ c & c^2 & c^3-1 \\end{vmatrix} = 0$, and $a, b, c$ are distinct, then the value of $abc$ is:",
    correctAnswer: "1",
    wrongAnswers: ["-1", "0", "2"]
  },
  {
    question: "If $f(\\theta) = \\begin{vmatrix} 1 & \\cos \\theta & 1 \\\\ -\\cos \\theta & 1 & \\cos \\theta \\\\ -1 & -\\cos \\theta & 1 \\end{vmatrix}$, then the range of $f(\\theta)$ is:",
    correctAnswer: "$[2, 4]$",
    wrongAnswers: ["$[0, 2]$", "$[2, 3]$", "$[1, 3]$"]
  },
  {
    question: "If $A$ and $B$ are square matrices of order 3, and $|A| = 2, |B| = 3$, then $|\\text{adj}(AB)|$ is:",
    correctAnswer: "36",
    wrongAnswers: ["6", "216", "18"]
  },
  {
    question: "If $A$ is a square matrix of order 3, and $|A| = 4$, then $|\\text{adj}(\\text{adj } 2A)|$ is equal to:",
    correctAnswer: "1048576",
    wrongAnswers: ["256", "65536", "4096"]
  },
  {
    question: "If $A$ is a square matrix of order $n$, and $|A| = d$, then $|\\text{adj}(\\text{adj } A)| = $",
    correctAnswer: "$d^{(n-1)^2}$",
    wrongAnswers: ["$d^{n-1}$", "$d^{(n-1)^n}$", "$d^{n^2}$"]
  },
  {
    question: "If $A = \\begin{bmatrix} \\lambda & 1 & 1 \\\\ 1 & \\lambda & 1 \\\\ 1 & 1 & \\lambda \\end{bmatrix}$ is singular, then the values of $\\lambda$ are:",
    correctAnswer: "$1, -2$",
    wrongAnswers: ["$-1, 2$", "$1, 2$", "$-1, -2$"]
  },
  {
    question: "Find the values of $a$ for which the system of equations $x + 2y - 3z = a$, $3x - y + 2z = b$, $x - 5y + 8z = c$ is consistent.",
    correctAnswer: "$2a - b + c = 0$",
    wrongAnswers: [
      "$a + b + c = 0$",
      "$2a + b - c = 0$",
      "$a - b + c = 0$"
    ]
  },
  {
    question: "If $a^2 + b^2 + c^2 = -2$, and $f(x) = \\begin{vmatrix} 1+a^2 x & (1+b^2)x & (1+c^2)x \\\\ (1+a^2)x & 1+b^2 x & (1+c^2)x \\\\ (1+a^2)x & (1+b^2)x & 1+c^2 x \\end{vmatrix}$, then $f(x)$ is a polynomial of degree:",
    correctAnswer: "2",
    wrongAnswers: ["3", "1", "0"]
  },
  {
    question: "If $x, y, z$ are not all zero, and the system of equations $x + ay = 0, y + az = 0, z + ax = 0$ has a non-zero solution, then the real value of $a$ is:",
    correctAnswer: "-1",
    wrongAnswers: ["1", "0", "2"]
  },
  {
    question: "If $A$ is a square matrix of order 3, and $|A| = 5$, then the determinant of the matrix $(A^T)^{-1} A$ is:",
    correctAnswer: "1",
    wrongAnswers: ["5", "25", "1/5"]
  },
  {
    question: "Let $A = \\begin{bmatrix} x & 2 & 3 \\\\ 1 & x & 1 \\\\ 3 & 2 & x \\end{bmatrix}$. If $|A|^3 = 125$, then the real values of $x$ are:",
    correctAnswer: "$\\pm 4$",
    wrongAnswers: ["$\\pm 5$", "$\\pm 2$", "$\\pm 3$"]
  },
  {
    question: "Find the value of $k$ if the system of equations $x+y-z=1, 2x+3y-2z=2, x+y+(k^2-5)z=k$ has infinitely many solutions.",
    correctAnswer: "2",
    wrongAnswers: ["-2", "$\\pm 2$", "0"]
  },
  {
    question: "Find the value of $k$ if the system of equations $x+y-z=1, 2x+3y-2z=2, x+y+(k^2-5)z=k$ has no solution.",
    correctAnswer: "-2",
    wrongAnswers: ["2", "$\\pm 2$", "$\\pm \\sqrt{5}$"]
  },
  {
    question: "If the system of equations $x - ky - z = 0, kx - y - z = 0, x + y - z = 0$ has a non-zero solution, then the values of $k$ are:",
    correctAnswer: "$1, -1$",
    wrongAnswers: ["$0, 1$", "$0, -1$", "$2, -2$"]
  },
  {
    question: "If $A = \\begin{bmatrix} a & 0 & 0 \\\\ 0 & b & 0 \\\\ 0 & 0 & c \\end{bmatrix}$ is non-singular, then its inverse matrix $A^{-1}$ is:",
    correctAnswer: "$\\begin{bmatrix} 1/a & 0 & 0 \\\\ 0 & 1/b & 0 \\\\ 0 & 0 & 1/c \\end{bmatrix}$",
    wrongAnswers: [
      "$\\begin{bmatrix} a & 0 & 0 \\\\ 0 & b & 0 \\\\ 0 & 0 & c \\end{bmatrix}$",
      "$\\frac{1}{abc} \\begin{bmatrix} 1/a & 0 & 0 \\\\ 0 & 1/b & 0 \\\\ 0 & 0 & 1/c \\end{bmatrix}$",
      "None of these"
    ]
  },
  {
    question: "If $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$, and $A^2 - 5A - 2I = O$, then $\\text{adj}(A)$ is equal to:",
    correctAnswer: "$A - 5I$",
    wrongAnswers: ["$A + 5I$", "$5I - A$", "$-A - 5I$"]
  },
  {
    question: "If $A$ and $B$ are non-singular matrices of order $n$, then which of the following is always true?",
    correctAnswer: "$(A \\cdot \\text{adj } A)B = B(A \\cdot \\text{adj } A)$",
    wrongAnswers: [
      "$\\text{adj}(A+B) = \\text{adj } A + \\text{adj } B$",
      "$(A+B)^{-1} = A^{-1} + B^{-1}$",
      "None of these"
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
  console.log('Connected to Database. Seeding Class 12 Determinants chapter...');

  // Find class No 12
  const classDoc = await Class.findOne({ classId: 12 });
  if (!classDoc) {
    console.error('Class 12 not found in classes collection!');
    process.exit(1);
  }
  const classId = classDoc._id;

  // Find or create chapter "Determinants"
  const { normalizeChapterName } = require('../utils/chapterNormalization');
  const normalized = normalizeChapterName('Determinants');
  let chapterDoc = await Chapter.findOne({ classId, normalizedChapterName: normalized });
  if (!chapterDoc) {
    console.log('Chapter "Determinants" not found. Creating it...');
    chapterDoc = await Chapter.create({
      classId: classId,
      chapterName: 'Determinants',
    });
  }
  const chapterId = chapterDoc._id;

  console.log(`Using classId: ${classId} ("Class 12")`);
  console.log(`Determinants chapterId: ${chapterId}`);

  let addedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < determinantsQuestions.length; i++) {
    const qData = determinantsQuestions[i];

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
        console.error(`Error saving Determinants question ${i + 1}: ${err.message}`);
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
