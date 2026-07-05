/**
 * Seeding script to add 75 questions in Relation and 75 questions in Function chapter for Class 12.
 * Distribution: 30% easy (23 questions), 30% medium (22 questions), 40% hard (30 questions) per chapter.
 * Language: "Both".
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');
const Class = require('../models/classModel');
const Chapter = require('../models/chapterModel');

const relationQuestions = [
  // ==========================================
  // RELATION: EASY (23 questions, 1 to 23)
  // ==========================================
  {
    question: "Let $A = \\{1, 2, 3\\}$. Which of the following is the identity relation on $A$?",
    options: ["$\\{(1,1), (2,2), (3,3)\\}$", "$\\{(1,1), (2,2)\\}$", "$\\{(1,1), (2,2), (3,3), (1,2)\\}$", "None of these"],
    correctAnswer: "$\\{(1,1), (2,2), (3,3)\\}$"
  },
  {
    question: "If a set $A$ has 3 elements, then the total number of relations on $A$ is:",
    options: ["9", "8", "512", "64"],
    correctAnswer: "512"
  },
  {
    question: "A relation $R$ on a set $A$ is symmetric if:",
    options: ["$(a,b) \\in R \\implies (b,a) \\in R$", "$(a,a) \\in R$", "$(a,b), (b,c) \\in R \\implies (a,c) \\in R$", "None of these"],
    correctAnswer: "$(a,b) \\in R \\implies (b,a) \\in R$"
  },
  {
    question: "Let $R = \\{(1,2), (3,4)\\}$ on a set. Find the domain of the relation $R$.",
    options: ["$\\{1, 3\\}$", "$\\{2, 4\\}$", "$\\{1, 2, 3, 4\\}$", "None of these"],
    correctAnswer: "$\\{1, 3\\}$"
  },
  {
    question: "Let $R = \\{(1,2), (3,4)\\}$ on a set. Find the range of the relation $R$.",
    options: ["$\\{1, 3\\}$", "$\\{2, 4\\}$", "$\\{1, 2, 3, 4\\}$", "None of these"],
    correctAnswer: "$\\{2, 4\\}$"
  },
  {
    question: "If $A = \\{a, b\\}$, the number of elements in the power set of $A \\times A$ is:",
    options: ["4", "16", "8", "32"],
    correctAnswer: "16"
  },
  {
    question: "If $R$ is a relation from $A$ to $B$ and $S$ is a relation from $B$ to $C$, then the composite inverse relation $(S \\circ R)^{-1}$ is equal to:",
    options: ["$R^{-1} \\circ S^{-1}$", "$S^{-1} \\circ R^{-1}$", "$R \\circ S$", "$S \\circ R$"],
    correctAnswer: "$R^{-1} \\circ S^{-1}$"
  },
  {
    question: "Let $R$ be a relation on the set of natural numbers $\\mathbb{N}$ defined by $x R y$ if $x + 2y = 8$. The domain of $R$ is:",
    options: ["$\\{2, 4, 6\\}$", "$\\{1, 2, 3\\}$", "$\\{2, 4, 8\\}$", "$\\{1, 3, 5\\}$"],
    correctAnswer: "$\\{2, 4, 6\\}$"
  },
  {
    question: "The empty relation on any set $A$ is always:",
    options: ["Reflexive", "Symmetric", "Transitive", "Symmetric and Transitive"],
    correctAnswer: "Symmetric and Transitive"
  },
  {
    question: "The universal relation on a non-empty set $A$ is always:",
    options: ["Reflexive only", "An equivalence relation", "Symmetric only", "Transitive only"],
    correctAnswer: "An equivalence relation"
  },
  {
    question: "If $A = \\{1, 2\\}$, which of the following relations is NOT reflexive on $A$?",
    options: ["$\\{(1,1), (2,2)\\}$", "$\\{(1,1), (2,2), (1,2)\\}$", "$\\{(1,1), (1,2)\\}$", "$\\{(1,1), (2,2), (2,1)\\}$"],
    correctAnswer: "$\\{(1,1), (1,2)\\}$"
  },
  {
    question: "If $R = \\{(x, y) \\in \\mathbb{N} \\times \\mathbb{N} : x < y\\}$, then $R$ is:",
    options: ["Reflexive", "Symmetric", "Transitive", "Equivalence"],
    correctAnswer: "Transitive"
  },
  {
    question: "If $R = \\{(x, y) : x \\text{ is the brother of } y\\}$ in a group of males, then $R$ is:",
    options: ["Reflexive", "Symmetric", "Transitive", "Equivalence"],
    correctAnswer: "Transitive"
  },
  {
    question: "If $R = \\{(x, y) : x \\text{ is perpendicular to } y\\}$ on the set of lines in a plane, then $R$ is:",
    options: ["Reflexive", "Symmetric", "Transitive", "Equivalence"],
    correctAnswer: "Symmetric"
  },
  {
    question: "If a relation $R$ is symmetric, then its inverse relation $R^{-1}$ satisfies:",
    options: ["$R^{-1} = R$", "$R^{-1} = \\emptyset$", "$R^{-1} \\neq R$", "None of these"],
    correctAnswer: "$R^{-1} = R$"
  },
  {
    question: "Find the range of the relation $R = \\{(x, y) \\in \\mathbb{N} \\times \\mathbb{N} : x + y = 5\\}$.",
    options: ["$\\{1, 2, 3, 4\\}$", "$\\{1, 2, 3, 4, 5\\}$", "$\\{2, 3, 4\\}$", "None of these"],
    correctAnswer: "$\\{1, 2, 3, 4\\}$"
  },
  {
    question: "Find the domain of the relation $R = \\{(x, y) \\in \\mathbb{N} \\times \\mathbb{N} : xy = 4\\}$.",
    options: ["$\\{1, 2, 4\\}$", "$\\{1, 2, 3, 4\\}$", "$\\{2, 4\\}$", "$\\{1, 4\\}$"],
    correctAnswer: "$\\{1, 2, 4\\}$"
  },
  {
    question: "If a relation $R$ is symmetric and transitive, is it necessarily reflexive?",
    options: ["Yes, always", "No, not necessarily", "Yes, if the set is finite", "None of these"],
    correctAnswer: "No, not necessarily"
  },
  {
    question: "A relation which is reflexive, symmetric, and transitive is known as:",
    options: ["Identity relation", "Equivalence relation", "Partial order relation", "Universal relation"],
    correctAnswer: "Equivalence relation"
  },
  {
    question: "Let $A = \\{1, 2, 3\\}$. Let $R = \\{(1,1), (2,2)\\}$. Is $R$ reflexive on $A$?",
    options: ["Yes", "No", "Symmetric only", "None of these"],
    correctAnswer: "No"
  },
  {
    question: "Let $R$ be a relation on $\\{1, 2, 3\\}$ given by $R = \\{(1,2), (2,3)\\}$. Is $R$ transitive?",
    options: ["Yes", "No", "Reflexive", "Equivalence"],
    correctAnswer: "No"
  },
  {
    question: "The intersection of two reflexive relations on a set is always:",
    options: ["Reflexive", "Symmetric", "Transitive", "None of these"],
    correctAnswer: "Reflexive"
  },
  {
    question: "The range of the relation $R = \\{(x, x^2) : x \\text{ is a prime number } < 10\\}$ is:",
    options: ["$\\{4, 9, 25, 49\\}$", "$\\{2, 3, 5, 7\\}$", "$\\{1, 4, 9, 25, 49\\}$", "None of these"],
    correctAnswer: "$\\{4, 9, 25, 49\\}$"
  },

  // ==========================================
  // RELATION: MEDIUM (22 questions, 24 to 45)
  // ==========================================
  {
    question: "If $A = \\{1, 2, 3\\}$, the number of equivalence relations on $A$ containing the element $(1,2)$ is:",
    options: ["1", "2", "3", "4"],
    correctAnswer: "2"
  },
  {
    question: "If $A = \\{1, 2, 3\\}$, the total number of equivalence relations on $A$ is:",
    options: ["2", "5", "8", "16"],
    correctAnswer: "5"
  },
  {
    question: "If $A = \\{1, 2, 3, 4\\}$, the total number of equivalence relations on $A$ is:",
    options: ["5", "10", "15", "20"],
    correctAnswer: "15"
  },
  {
    question: "Let $R$ be a relation on the set of integers $\\mathbb{Z}$ defined by $a R b$ iff $a - b$ is divisible by 5. This relation is:",
    options: ["Reflexive but not transitive", "Symmetric but not reflexive", "An equivalence relation", "None of these"],
    correctAnswer: "An equivalence relation"
  },
  {
    question: "Let $R$ be a relation on natural numbers $\\mathbb{N}$ defined by $a R b$ iff $a$ divides $b$. This relation is:",
    options: ["Equivalence relation", "Reflexive and transitive but not symmetric", "Reflexive and symmetric but not transitive", "Symmetric and transitive but not reflexive"],
    correctAnswer: "Reflexive and transitive but not symmetric"
  },
  {
    question: "The number of reflexive relations on a set with $n$ elements is:",
    options: ["$2^n$", "$2^{n^2}$", "$2^{n(n-1)}$", "$2^{n(n+1)/2}$"],
    correctAnswer: "$2^{n(n-1)}$"
  },
  {
    question: "The number of symmetric relations on a set with $n$ elements is:",
    options: ["$2^{n(n-1)/2}$", "$2^{n(n+1)/2}$", "$2^{n(n-1)}$", "$2^{n^2}$"],
    correctAnswer: "$2^{n(n+1)/2}$"
  },
  {
    question: "Let $R$ be a relation on the power set $\\mathcal{P}(X)$ of a non-empty set $X$ defined by $A R B$ iff $A \\subseteq B$. This relation is:",
    options: ["Equivalence", "Reflexive and transitive but not symmetric", "Symmetric but not transitive", "Transitive but not reflexive"],
    correctAnswer: "Reflexive and transitive but not symmetric"
  },
  {
    question: "Let $R$ be a relation on the power set $\\mathcal{P}(X)$ defined by $A R B$ iff $A \\cap B = \\emptyset$. This relation is:",
    options: ["Reflexive", "Symmetric but not reflexive", "Transitive", "Equivalence"],
    correctAnswer: "Symmetric but not reflexive"
  },
  {
    question: "If $R$ and $S$ are two equivalence relations on a set $A$, then which of the following is correct?",
    options: ["$R \\cap S$ is an equivalence relation", "$R \\cup S$ is always an equivalence relation", "$R \\setminus S$ is an equivalence relation", "None of these"],
    correctAnswer: "$R \\cap S$ is an equivalence relation"
  },
  {
    question: "If $R$ and $S$ are two equivalence relations on a set $A$, then their union $R \\cup S$ is:",
    options: ["Always an equivalence relation", "Never an equivalence relation", "Not necessarily an equivalence relation", "Symmetric and transitive but not reflexive"],
    correctAnswer: "Not necessarily an equivalence relation"
  },
  {
    question: "Let $R$ be a relation on real numbers $\\mathbb{R}$ defined by $x R y$ iff $1 + xy > 0$. This relation is:",
    options: ["Reflexive and symmetric but not transitive", "Equivalence relation", "Reflexive and transitive but not symmetric", "Symmetric and transitive but not reflexive"],
    correctAnswer: "Reflexive and symmetric but not transitive"
  },
  {
    question: "Let $R$ be a relation on real numbers $\\mathbb{R}$ defined by $x R y$ iff $x - y + \\sqrt{2}$ is an irrational number. This relation is:",
    options: ["Reflexive but not symmetric or transitive", "Symmetric only", "Transitive only", "Equivalence relation"],
    correctAnswer: "Reflexive but not symmetric or transitive"
  },
  {
    question: "Let $R$ be a relation on real numbers $\\mathbb{R}$ defined by $x R y$ iff $|x - y| \\le 1$. This relation is:",
    options: ["Reflexive and symmetric but not transitive", "Equivalence relation", "Reflexive and transitive but not symmetric", "None of these"],
    correctAnswer: "Reflexive and symmetric but not transitive"
  },
  {
    question: "Let $L$ be the set of all straight lines in a plane. Let $R$ be defined by $l_1 R l_2$ iff $l_1$ is parallel to $l_2$. This relation is:",
    options: ["Reflexive only", "Symmetric only", "An equivalence relation", "Transitive only"],
    correctAnswer: "An equivalence relation"
  },
  {
    question: "The relation $R$ defined on the set of all triangles in a plane as $T_1 R T_2$ iff $T_1$ is congruent to $T_2$ is:",
    options: ["Equivalence relation", "Reflexive and symmetric but not transitive", "Symmetric and transitive but not reflexive", "None of these"],
    correctAnswer: "Equivalence relation"
  },
  {
    question: "The relation $R$ defined on the set of all polygons as $P_1 R P_2$ iff $P_1$ and $P_2$ have the same number of sides is:",
    options: ["Equivalence relation", "Reflexive and symmetric only", "Transitive only", "Identity relation"],
    correctAnswer: "Equivalence relation"
  },
  {
    question: "If $R$ is an equivalence relation on $A$, then its inverse relation $R^{-1}$ is:",
    options: ["An equivalence relation", "Symmetric but not transitive", "Reflexive but not symmetric", "None of these"],
    correctAnswer: "An equivalence relation"
  },
  {
    question: "Let $R = \\{(1,2), (2,3)\\}$ and $S = \\{(2,3), (3,4)\\}$. The composite relation $S \\circ R$ is:",
    options: ["$\\{(1,3), (2,4)\\}$", "$\\{(1,4)\\}$", "$\\{(2,3)\\}$", "None of these"],
    correctAnswer: "$\\{(1,3), (2,4)\\}$"
  },
  {
    question: "Let $R$ be a relation on integers $\\mathbb{Z}$ given by $a R b$ iff $a^2 = b^2$. This relation is:",
    options: ["Reflexive and symmetric but not transitive", "Equivalence relation", "Symmetric and transitive but not reflexive", "None of these"],
    correctAnswer: "Equivalence relation"
  },
  {
    question: "The domain of the relation $R = \\{(x, y) \\in \\mathbb{R} \\times \\mathbb{R} : x^2 + y^2 = 9\\}$ is:",
    options: ["$[-3, 3]$", "$[0, 3]$", "$[-9, 9]$", "$\\mathbb{R}$"],
    correctAnswer: "$[-3, 3]$"
  },
  {
    question: "Let $R$ be a relation on $\\mathbb{N}$ defined by $x R y$ iff $x^2 - 4xy + 3y^2 = 0$. This relation is:",
    options: ["Reflexive but not symmetric", "Symmetric but not reflexive", "Transitive but not reflexive", "Equivalence relation"],
    correctAnswer: "Reflexive but not symmetric"
  },

  // ==========================================
  // RELATION: HARD (30 questions, 46 to 75)
  // ==========================================
  {
    question: "Let $R$ be a relation on $\\mathbb{N} \\times \\mathbb{N}$ defined by $(a,b) R (c,d)$ iff $a+d = b+c$. This relation is:",
    options: ["Reflexive but not symmetric", "Symmetric but not transitive", "An equivalence relation", "None of these"],
    correctAnswer: "An equivalence relation"
  },
  {
    question: "Let $R$ be a relation on $\\mathbb{N} \\times \\mathbb{N}$ defined by $(a,b) R (c,d)$ iff $ad = bc$. This relation is:",
    options: ["Equivalence relation", "Reflexive and symmetric but not transitive", "Reflexive and transitive but not symmetric", "None of these"],
    correctAnswer: "Equivalence relation"
  },
  {
    question: "Let $R$ be a relation on $\\mathbb{Z} \\times (\\mathbb{Z} \\setminus \\{0\\})$ defined by $(a,b) R (c,d)$ iff $ad = bc$. This relation is:",
    options: ["Equivalence relation", "Symmetric but not transitive", "Transitive but not reflexive", "None of these"],
    correctAnswer: "Equivalence relation"
  },
  {
    question: "Let $R$ be a relation on $\\mathbb{N} \\times \\mathbb{N}$ defined by $(a,b) R (c,d)$ iff $a + c = b + d$. Is this relation transitive?",
    options: ["Yes", "No", "Yes, if a=b", "None of these"],
    correctAnswer: "No"
  },
  {
    question: "The total number of equivalence relations on the set $\\{1, 2, 3, 4, 5\\}$ is:",
    options: ["15", "52", "125", "203"],
    correctAnswer: "52"
  },
  {
    question: "The equivalence class of $0$ under the relation $a R b$ iff $a - b$ is an even integer on the set of integers $\\mathbb{Z}$ is:",
    options: ["The set of all even integers", "The set of all odd integers", "$\\{0\\}$", "None of these"],
    correctAnswer: "The set of all even integers"
  },
  {
    question: "Let $R$ be a relation on real numbers $\\mathbb{R}$ defined by $a R b$ iff $a \\le b^2$. This relation is:",
    options: ["Reflexive only", "Symmetric only", "Transitive only", "None of reflexive, symmetric, or transitive"],
    correctAnswer: "None of reflexive, symmetric, or transitive"
  },
  {
    question: "Let $R$ be a relation on real numbers $\\mathbb{R}$ defined by $a R b$ iff $a \\le b^3$. This relation is:",
    options: ["Reflexive only", "Symmetric only", "Transitive only", "None of reflexive, symmetric, or transitive"],
    correctAnswer: "None of reflexive, symmetric, or transitive"
  },
  {
    question: "Let $R$ be a relation on real numbers $\\mathbb{R}$ defined by $a R b$ iff $a - b$ is an integer. The equivalence class of $\\frac{1}{2}$ is:",
    options: ["$\\{n + \\frac{1}{2} : n \\in \\mathbb{Z}\\}$", "$\\{\\frac{1}{2}\\}$", "$\\{n : n \\in \\mathbb{Z}\\}$", "None of these"],
    correctAnswer: "$\\{n + \\frac{1}{2} : n \\in \\mathbb{Z}\\}$"
  },
  {
    question: "If $R$ is a transitive relation on a set $A$, then the relation $R \\cup R^{-1}$ is:",
    options: ["Always transitive", "Never transitive", "Not necessarily transitive", "Reflexive always"],
    correctAnswer: "Not necessarily transitive"
  },
  {
    question: "The total number of anti-symmetric relations on a set with $n$ elements is:",
    options: ["$2^n \\cdot 3^{n(n-1)/2}$", "$2^n \\cdot 3^{n(n-1)}$", "$2^{n(n-1)} \\cdot 3^n$", "None of these"],
    correctAnswer: "$2^n \\cdot 3^{n(n-1)/2}$"
  },
  {
    question: "Let $R$ and $S$ be two relations on a set $A$. If $R$ and $S$ are transitive, is $R \\cup S$ transitive?",
    options: ["Yes, always", "No, not necessarily", "Yes, if the set is infinite", "None of these"],
    correctAnswer: "No, not necessarily"
  },
  {
    question: "A relation $R$ on a set $A$ is anti-symmetric if and only if:",
    options: ["$(a,b) \\in R \\text{ and } (b,a) \\in R \\implies a = b$", "$(a,b) \\in R \\implies (b,a) \\notin R$", "$(a,a) \\notin R$", "None of these"],
    correctAnswer: "$(a,b) \\in R \\text{ and } (b,a) \\in R \\implies a = b$"
  },
  {
    question: "The relation $R = \\{(x, y) \\in \\mathbb{Z} \\times \\mathbb{Z} : |x - y| \\le 1\\}$ is:",
    options: ["Reflexive and symmetric but not transitive", "Equivalence relation", "Symmetric and transitive but not reflexive", "None of these"],
    correctAnswer: "Reflexive and symmetric but not transitive"
  },
  {
    question: "Let $R$ be a relation on natural numbers $\\mathbb{N}$ defined by $x R y$ iff $x^3 - y^3$ is divisible by 7. This relation is:",
    options: ["Reflexive but not symmetric", "Symmetric but not transitive", "Equivalence relation", "None of these"],
    correctAnswer: "Equivalence relation"
  },
  {
    question: "Let $R$ be a relation on integers $\\mathbb{Z}$ defined by $a R b$ iff $a^2 - b^2$ is divisible by 4. The number of distinct equivalence classes is:",
    options: ["1", "2", "3", "4"],
    correctAnswer: "2"
  },
  {
    question: "Let $R$ be a relation on natural numbers $\\mathbb{N}$ defined by $x R y$ iff $x + 3y$ is even. This relation is:",
    options: ["Equivalence relation", "Symmetric but not transitive", "Reflexive but not symmetric", "None of these"],
    correctAnswer: "Equivalence relation"
  },
  {
    question: "Let $R$ be a relation on natural numbers $\\mathbb{N}$ defined by $x R y$ iff $x + 3y$ is divisible by 4. This relation is:",
    options: ["Reflexive only", "Equivalence relation", "Symmetric and transitive but not reflexive", "None of these"],
    correctAnswer: "Equivalence relation"
  },
  {
    question: "If a relation $R$ on a set $A$ is both symmetric and anti-symmetric, then which of the following is correct?",
    options: ["$R$ is a subset of the identity relation $I_A$", "$R$ is the universal relation", "$R$ is the empty relation only", "None of these"],
    correctAnswer: "$R$ is a subset of the identity relation $I_A$"
  },
  {
    question: "Let $A = \\{1, 2, 3\\}$. The number of relations on $A$ which are both reflexive and symmetric is:",
    options: ["8", "16", "32", "64"],
    correctAnswer: "8"
  },
  {
    question: "The number of equivalence relations on the set $\\{1, 2, 3, 4\\}$ that contain both the elements $(1,2)$ and $(2,3)$ is:",
    options: ["1", "2", "5", "8"],
    correctAnswer: "2"
  },
  {
    question: "Let $R$ be a relation on complex numbers $\\mathbb{C}$ defined by $z_1 R z_2$ iff $\\frac{z_1 - z_2}{z_1 + z_2}$ is real. Is this relation reflexive?",
    options: ["Yes, always", "No, since it is not defined for $z_1 = -z_2$", "Yes, except at $z=0$", "None of these"],
    correctAnswer: "No, since it is not defined for $z_1 = -z_2$"
  },
  {
    question: "Let $R$ be a relation on $\\mathbb{R} \\times \\mathbb{R}$ defined by $(x_1, y_1) R (x_2, y_2)$ iff $x_1^2 + y_1^2 = x_2^2 + y_2^2$. This relation is:",
    options: ["Equivalence relation", "Reflexive and symmetric but not transitive", "Symmetric and transitive but not reflexive", "None of these"],
    correctAnswer: "Equivalence relation"
  },
  {
    question: "The number of relations on a set with $n$ elements that are reflexive but not symmetric is:",
    options: ["$2^{n(n-1)} - 2^{n(n-1)/2}$", "$2^{n^2} - 2^{n(n+1)/2}$", "$2^{n(n-1)/2}$", "None of these"],
    correctAnswer: "$2^{n(n-1)} - 2^{n(n-1)/2}$"
  },
  {
    question: "Let $A = \\{1, 2, 3\\}$. The number of symmetric relations on $A$ that are not reflexive is:",
    options: ["56", "64", "8", "48"],
    correctAnswer: "56"
  },
  {
    question: "Let $R$ be a relation on real numbers $\\mathbb{R}$ defined by $x R y$ iff $xy$ is a rational number. This relation is:",
    options: ["Symmetric but not reflexive or transitive", "Equivalence relation", "Reflexive and transitive but not symmetric", "None of these"],
    correctAnswer: "Symmetric but not reflexive or transitive"
  },
  {
    question: "Let $R$ be a relation on integers $\\mathbb{Z}$ defined by $x R y$ iff $x \\cdot y \\ge 0$. This relation is:",
    options: ["Reflexive and symmetric but not transitive", "Equivalence relation", "Reflexive and transitive but not symmetric", "None of these"],
    correctAnswer: "Reflexive and symmetric but not transitive"
  },
  {
    question: "Let $R$ be a relation on the set of all real functions $f: \\mathbb{R} \\to \\mathbb{R}$ defined by $f R g$ iff $f(x) \\le g(x)$ for all $x \\in \\mathbb{R}$. This relation is:",
    options: ["Partial order relation", "Equivalence relation", "Symmetric but not reflexive", "None of these"],
    correctAnswer: "Partial order relation"
  },
  {
    question: "Let $R$ be a relation on natural numbers $\\mathbb{N}$ defined by $a R b$ iff $\\gcd(a, b) > 1$. This relation is:",
    options: ["Symmetric but not reflexive or transitive", "Equivalence relation", "Reflexive and transitive", "None of these"],
    correctAnswer: "Symmetric but not reflexive or transitive"
  },
  {
    question: "Let $R$ be a relation on $\\mathbb{N} \\times \\mathbb{N}$ defined by $(a,b) R (c,d)$ iff $a \\le c$ and $b \\le d$. This relation is:",
    options: ["Partial order relation", "Equivalence relation", "Symmetric and transitive", "None of these"],
    correctAnswer: "Partial order relation"
  }
];

const functionQuestions = [
  // ==========================================
  // FUNCTION: EASY (23 questions, 1 to 23)
  // ==========================================
  {
    question: "If $f(x) = x^2 + 2x + 1$, find the value of $f(-1)$.",
    options: ["0", "1", "2", "-1"],
    correctAnswer: "0"
  },
  {
    question: "Let $A = \\{1, 2\\}$ and $B = \\{3, 4\\}$. How many functions are there from $A$ to $B$?",
    options: ["2", "4", "8", "16"],
    correctAnswer: "4"
  },
  {
    question: "The domain of the function $f(x) = \\frac{1}{x-2}$ is:",
    options: ["$\\mathbb{R} \\setminus \\{2\\}$", "$\\mathbb{R}$", "$\\mathbb{R} \\setminus \\{-2\\}$", "None of these"],
    correctAnswer: "$\\mathbb{R} \\setminus \\{2\\}$"
  },
  {
    question: "The range of the function $f(x) = x^2$ for $x \\in \\mathbb{R}$ is:",
    options: ["$[0, \\infty)$", "$(-\\infty, 0]$", "$\\mathbb{R}$", "$(0, \\infty)$"],
    correctAnswer: "$[0, \\infty)$"
  },
  {
    question: "Let $f: \\mathbb{R} \\to \\mathbb{R}$ be defined by $f(x) = 2x + 3$. This function is:",
    options: ["One-one but not onto", "Onto but not one-one", "One-one and onto (bijective)", "Neither one-one nor onto"],
    correctAnswer: "One-one and onto (bijective)"
  },
  {
    question: "If $f(x) = \\sin x$ and $g(x) = x^2$, find the composition expression $f(g(x))$.",
    options: ["$\\sin(x^2)$", "$\\sin^2 x$", "$x^2 \\sin x$", "None of these"],
    correctAnswer: "$\\sin(x^2)$"
  },
  {
    question: "If $f(x) = \\sin x$ and $g(x) = x^2$, find the composition expression $g(f(x))$.",
    options: ["$\\sin(x^2)$", "$\\sin^2 x$", "$x^2 \\sin x$", "None of these"],
    correctAnswer: "$\\sin^2 x$"
  },
  {
    question: "The function $f: \\mathbb{R} \\to \\mathbb{R}$ defined by $f(x) = |x|$ is:",
    options: ["One-one and onto", "One-one but not onto", "Many-one and into", "Many-one and onto"],
    correctAnswer: "Many-one and into"
  },
  {
    question: "A function $f: A \\to B$ is called onto (surjective) if:",
    options: ["Range of $f$ = $B$", "Range of $f \\subset B$", "Range of $f \\supset B$", "None of these"],
    correctAnswer: "Range of $f$ = $B$"
  },
  {
    question: "A function $f: A \\to B$ is one-one (injective) if:",
    options: ["$f(x_1) = f(x_2) \\implies x_1 = x_2$", "$x_1 = x_2 \\implies f(x_1) = f(x_2)$", "$f(x_1) \\neq f(x_2)$ always", "None of these"],
    correctAnswer: "$f(x_1) = f(x_2) \\implies x_1 = x_2$"
  },
  {
    question: "If $n(A) = 3$ and $n(B) = 4$, the total number of one-one functions from $A$ to $B$ is:",
    options: ["12", "24", "64", "81"],
    correctAnswer: "24"
  },
  {
    question: "If $n(A) = 4$ and $n(B) = 3$, the total number of one-one functions from $A$ to $B$ is:",
    options: ["0", "12", "24", "81"],
    correctAnswer: "0"
  },
  {
    question: "If $f(x) = 3x - 5$, find the inverse function $f^{-1}(x)$.",
    options: ["$\\frac{x+5}{3}$", "$\\frac{x-5}{3}$", "$3x+5$", "None of these"],
    correctAnswer: "$\\frac{x+5}{3}$"
  },
  {
    question: "The range of the constant function $f(x) = c$ on the set of real numbers $\\mathbb{R}$ is:",
    options: ["$\\mathbb{R}$", "$\\{c\\}$", "$\\{0\\}$", "None of these"],
    correctAnswer: "$\\{c\\}$"
  },
  {
    question: "If $f(x) = \\log_e x$, what is its domain?",
    options: ["$(0, \\infty)$", "$[0, \\infty)$", "$\\mathbb{R}$", "$\\mathbb{R} \\setminus \\{0\\}$"],
    correctAnswer: "$(0, \\infty)$"
  },
  {
    question: "If $f(x) = e^x$, what is its range?",
    options: ["$(0, \\infty)$", "$[0, \\infty)$", "$\\mathbb{R}$", "None of these"],
    correctAnswer: "$(0, \\infty)$"
  },
  {
    question: "The identity function $I_A: A \\to A$ on a non-empty set $A$ is always:",
    options: ["Bijective", "Injective but not surjective", "Surjective but not injective", "Many-one"],
    correctAnswer: "Bijective"
  },
  {
    question: "The function $f: \\mathbb{R} \\to \\mathbb{R}$ defined by $f(x) = x^3$ is:",
    options: ["One-one but not onto", "Onto but not one-one", "One-one and onto (bijective)", "None of these"],
    correctAnswer: "One-one and onto (bijective)"
  },
  {
    question: "The greatest integer function $f(x) = [x]$ from $\\mathbb{R}$ to $\\mathbb{R}$ is:",
    options: ["One-one and onto", "One-one but not onto", "Many-one and into", "Many-one and onto"],
    correctAnswer: "Many-one and into"
  },
  {
    question: "The range of the signum function $f(x) = \\text{sgn}(x)$ is:",
    options: ["$\\{-1, 0, 1\\}$", "$[-1, 1]$", "$\\mathbb{R}$", "None of these"],
    correctAnswer: "$\\{-1, 0, 1\\}$"
  },
  {
    question: "If $f(x) = \\cos x$ defined on $\\mathbb{R}$, what is its maximum value?",
    options: ["0", "1", "$\\pi$", "None of these"],
    correctAnswer: "1"
  },
  {
    question: "If $f(x) = x+1$ and $g(x) = 2x$, find the sum function $(f+g)(x)$.",
    options: ["$3x+1$", "$2x+1$", "$2x^2+2$", "$3x$"],
    correctAnswer: "$3x+1$"
  },
  {
    question: "The function $f: \\mathbb{R} \\to \\mathbb{R}$ defined by $f(x) = x^2 + 1$ is:",
    options: ["One-one and onto", "Many-one and into", "One-one and into", "Many-one and onto"],
    correctAnswer: "Many-one and into"
  },

  // ==========================================
  // FUNCTION: MEDIUM (22 questions, 24 to 45)
  // ==========================================
  {
    question: "Find the domain of the function $f(x) = \\sqrt{9 - x^2}$.",
    options: ["$[-3, 3]$", "$[0, 3]$", "$(-3, 3)$", "None of these"],
    correctAnswer: "$[-3, 3]$"
  },
  {
    question: "Find the range of the function $f(x) = \\sqrt{9 - x^2}$.",
    options: ["$[-3, 3]$", "$[0, 3]$", "$[0, 9]$", "None of these"],
    correctAnswer: "$[0, 3]$"
  },
  {
    question: "If $f(x) = \\frac{x-1}{x+1}$, find the double composition expression $f(f(x))$.",
    options: ["$-\\frac{1}{x}$", "$\\frac{x-1}{x+1}$", "$x$", "None of these"],
    correctAnswer: "$-\\frac{1}{x}$"
  },
  {
    question: "Find the domain of the function $f(x) = \\frac{1}{\\sqrt{x^2 - 4}}$.",
    options: ["$(-\\infty, -2) \\cup (2, \\infty)$", "$[-2, 2]$", "$\\mathbb{R} \\setminus \\{-2, 2\\}$", "None of these"],
    correctAnswer: "$(-\infty, -2) \\cup (2, \\infty)$"
  },
  {
    question: "The range of the function $f(x) = \\frac{x}{|x|}$ for $x \\neq 0$ is:",
    options: ["$\\{-1, 1\\}$", "$[-1, 1]$", "$\\mathbb{R} \\setminus \\{0\\}$", "None of these"],
    correctAnswer: "$\\{-1, 1\\}$"
  },
  {
    question: "If $f: \\mathbb{R} \\to \\mathbb{R}$ is defined by $f(x) = x^2$, then the preimage set $f^{-1}(4)$ is:",
    options: ["$\\{-2, 2\\}$", "$\\{2\\}$", "$\\{-2\\}$", "None of these"],
    correctAnswer: "$\\{-2, 2\\}$"
  },
  {
    question: "If $f: \\mathbb{R} \\to \\mathbb{R}$ is defined by $f(x) = x^2 + 5$, then the preimage set $f^{-1}(9)$ is:",
    options: ["$\\{-2, 2\\}$", "$\\{2\\}$", "$\\{\\}$", "None of these"],
    correctAnswer: "$\\{-2, 2\\}$"
  },
  {
    question: "The real-valued function $f(x) = x \\sin x$ is classified as a/an:",
    options: ["Even function", "Odd function", "Periodic with period $\\pi$", "None of these"],
    correctAnswer: "Even function"
  },
  {
    question: "The real-valued function $f(x) = x \\cos x$ is classified as a/an:",
    options: ["Even function", "Odd function", "Periodic with period $2\\pi$", "None of these"],
    correctAnswer: "Odd function"
  },
  {
    question: "If $n(A) = 3$, the total number of bijective functions (bijections) from $A$ to itself is:",
    options: ["3", "6", "9", "27"],
    correctAnswer: "6"
  },
  {
    question: "Find the inverse of the linear function $f(x) = \\frac{2x+3}{5}$.",
    options: ["$\\frac{5x-3}{2}$", "$\\frac{5x+3}{2}$", "$\\frac{2x-3}{5}$", "None of these"],
    correctAnswer: "$\\frac{5x-3}{2}$"
  },
  {
    question: "The domain of the logarithmic function $f(x) = \\log(x^2 - 5x + 6)$ is:",
    options: ["$(-\\infty, 2) \\cup (3, \\infty)$", "$(2, 3)$", "$\\mathbb{R} \\setminus \\{2, 3\\}$", "None of these"],
    correctAnswer: "$(-\\infty, 2) \\cup (3, \\infty)$"
  },
  {
    question: "Let $f: [0, \\infty) \\to [0, \\infty)$ be defined by $f(x) = x^2$. This function is:",
    options: ["One-one but not onto", "Onto but not one-one", "Bijective", "Neither one-one nor onto"],
    correctAnswer: "Bijective"
  },
  {
    question: "If $f(x) = x^2 - 3x + 2$, find the expression $f(x+1)$.",
    options: ["$x^2 - x$", "$x^2 - 3x + 3$", "$x^2 - x + 2$", "None of these"],
    correctAnswer: "$x^2 - x$"
  },
  {
    question: "The period of the trigonometric function $f(x) = \\sin(3x)$ is:",
    options: ["$2\\pi$", "$\\frac{2\\pi}{3}$", "$\\frac{\\pi}{3}$", "None of these"],
    correctAnswer: "$\\frac{2\\pi}{3}$"
  },
  {
    question: "The range of the function $f(x) = 2 - 3 \\cos x$ is:",
    options: ["$[-1, 5]$", "$[2, 5]$", "$[-3, 3]$", "None of these"],
    correctAnswer: "$[-1, 5]$"
  },
  {
    question: "The total number of onto functions from a set containing 3 elements to a set containing 2 elements is:",
    options: ["6", "8", "4", "2"],
    correctAnswer: "6"
  },
  {
    question: "If $f(x) = \\frac{3x+4}{5x-7}$, find the value of $x$ for which $f(x)$ is not defined.",
    options: ["$\\frac{7}{5}$", "$\\frac{5}{7}$", "$\\frac{3}{5}$", "None of these"],
    correctAnswer: "$\\frac{7}{5}$"
  },
  {
    question: "If $f(x) = \\frac{1}{1-x}$, find the triple composition $f(f(f(x)))$.",
    options: ["$x$", "$\\frac{1}{1-x}$", "$1-x$", "None of these"],
    correctAnswer: "$x$"
  },
  {
    question: "The domain of the function $f(x) = \\sqrt{x - [x]}$ (where $[x]$ is the greatest integer function) is:",
    options: ["$\\mathbb{R}$", "$[0, \\infty)$", "$[0, 1)$", "None of these"],
    correctAnswer: "$\\mathbb{R}$"
  },
  {
    question: "The range of the function $f(x) = x - [x]$ (fractional part function) is:",
    options: ["$[0, 1)$", "$[0, 1]$", "$(0, 1)$", "None of these"],
    correctAnswer: "$[0, 1)$"
  },
  {
    question: "Let $f(x) = \\frac{x}{1+|x|}$ for $x \\in \\mathbb{R}$. The range of $f(x)$ is:",
    options: ["$(-1, 1)$", "$[-1, 1]$", "$\\mathbb{R}$", "None of these"],
    correctAnswer: "$(-1, 1)$"
  },

  // ==========================================
  // FUNCTION: HARD (30 questions, 46 to 75)
  // ==========================================
  {
    question: "The domain of the function $f(x) = \\arcsin(2x - 3)$ is:",
    options: ["$[1, 2]$", "$[-1, 1]$", "$[0, 3]$", "None of these"],
    correctAnswer: "$[1, 2]$"
  },
  {
    question: "The domain of the function $f(x) = \\log_{10}(1 - \\log_{10}(x^2 - 5x + 16))$ is:",
    options: ["$(2, 3)$", "$[2, 3]$", "$(1, 4)$", "None of these"],
    correctAnswer: "$(2, 3)$"
  },
  {
    question: "The range of the function $f(x) = \\frac{x^2}{1+x^2}$ is:",
    options: ["$[0, 1)$", "$[0, 1]$", "$(0, 1)$", "None of these"],
    correctAnswer: "$[0, 1)$"
  },
  {
    question: "Find the range of the function $f(x) = \\frac{x}{1+x^2}$ for $x \\in \\mathbb{R}$.",
    options: ["$[-1/2, 1/2]$", "$[-1, 1]$", "$\\mathbb{R}$", "None of these"],
    correctAnswer: "$[-1/2, 1/2]$"
  },
  {
    question: "If $f(x) + 2f(1/x) = 3x$ for all $x \\neq 0$, find the expression for $f(x)$.",
    options: ["$\\frac{2-x^2}{x}$", "$\\frac{2+x^2}{x}$", "$\\frac{x^2-2}{x}$", "None of these"],
    correctAnswer: "$\\frac{2-x^2}{x}$"
  },
  {
    question: "The range of the function $f(x) = \\arccos\\left(\\frac{1+x^2}{2x}\\right)$ is:",
    options: ["$\\{0, \\pi\\}$", "$[0, \\pi]$", "$\\{0\\}$", "None of these"],
    correctAnswer: "$\\{0, \\pi\\}$"
  },
  {
    question: "If $f(x) = \\log\\left(\frac{1-x}{1+x}\\right)$, then $f(a) + f(b)$ is equal to:",
    options: ["$f\\left(\\frac{a+b}{1+ab}\\right)$", "$f\\left(\\frac{a-b}{1-ab}\\right)$", "$f(a+b)$", "None of these"],
    correctAnswer: "$f\\left(\\frac{a+b}{1+ab}\\right)$"
  },
  {
    question: "The domain of the composite function $f(x) = \\sqrt{\\cos(\\sin x)}$ is:",
    options: ["$\\mathbb{R}$", "$[0, \\infty)$", "$[-\\frac{\\pi}{2}, \\frac{\\pi}{2}]$", "None of these"],
    correctAnswer: "$\\mathbb{R}$"
  },
  {
    question: "The domain of the function $f(x) = \\sqrt{\\sin(\\cos x)}$ is:",
    options: ["$\\bigcup_{n \\in \\mathbb{Z}} [2n\\pi - \\frac{\\pi}{2}, 2n\\pi + \\frac{\\pi}{2}]$", "$\\mathbb{R}$", "$[0, \\infty)$", "None of these"],
    correctAnswer: "$\\bigcup_{n \\in \\mathbb{Z}} [2n\\pi - \\frac{\\pi}{2}, 2n\\pi + \\frac{\\pi}{2}]$"
  },
  {
    question: "The function $f(x) = \\log(x + \\sqrt{x^2+1})$ is classified as a/an:",
    options: ["Even function", "Odd function", "Neither even nor odd", "None of these"],
    correctAnswer: "Odd function"
  },
  {
    question: "Find the inverse of the hyperbolic-like function $f(x) = \\frac{e^x - e^{-x}}{e^x + e^{-x}}$.",
    options: ["$\\frac{1}{2}\\log\\left(\\frac{1+x}{1-x}\\right)$", "$\\log\\left(\\frac{1+x}{1-x}\\right)$", "$\\frac{1}{2}\\log\\left(\\frac{1-x}{1+x}\\right)$", "None of these"],
    correctAnswer: "$\\frac{1}{2}\\log\\left(\\frac{1+x}{1-x}\\right)$"
  },
  {
    question: "The total number of onto functions from a set containing 5 elements to a set containing 3 elements is:",
    options: ["150", "243", "125", "120"],
    correctAnswer: "150"
  },
  {
    question: "The domain of the function $f(x) = \\frac{1}{\\sqrt{[x]^2 - [x] - 6}}$ is:",
    options: ["$(-\\infty, -2) \\cup [4, \\infty)$", "$(4, \\infty)$", "$( -\\infty, -3] \\cup [3, \\infty)$", "None of these"],
    correctAnswer: "$(-\\infty, -2) \\cup [4, \\infty)$"
  },
  {
    question: "The period of the function $f(x) = \\sin^4 x + \\cos^4 x$ is:",
    options: ["$\\frac{\\pi}{2}$", "$\\pi$", "$2\\pi$", "None of these"],
    correctAnswer: "$\\frac{\\pi}{2}$"
  },
  {
    question: "Find the domain of the function $f(x) = \\sqrt{\\log_{0.5}(x^2 - 5x + 6)}$.",
    options: ["$[\\frac{5-\\sqrt{5}}{2}, 2) \\cup (3, \\frac{5+\\sqrt{5}}{2}]$", "$(2, 3)$", "$[\\frac{5-\\sqrt{5}}{2}, \\frac{5+\\sqrt{5}}{2}]$", "None of these"],
    correctAnswer: "$[\\frac{5-\\sqrt{5}}{2}, 2) \\cup (3, \\frac{5+\\sqrt{5}}{2}]$"
  },
  {
    question: "If $f(x) = \\frac{4^x}{4^x + 2}$, then the sum expression $f(x) + f(1-x)$ is equal to:",
    options: ["1", "2", "0", "None of these"],
    correctAnswer: "1"
  },
  {
    question: "Let $f(x) = \\frac{\\alpha x}{x+1}$ ($x \\neq -1$). If $f(f(x)) = x$ for all $x \\neq -1$, then the value of $\\alpha$ is:",
    options: ["-1", "1", "0", "None of these"],
    correctAnswer: "-1"
  },
  {
    question: "Find the range of the function $f(x) = \\frac{x^2 - x + 1}{x^2 + x + 1}$ for $x \\in \\mathbb{R}$.",
    options: ["$[\\frac{1}{3}, 3]$", "$[0, 3]$", "$[\\frac{1}{3}, \\infty)$", "None of these"],
    correctAnswer: "$[\\frac{1}{3}, 3]$"
  },
  {
    question: "Find the domain of the function $f(x) = \\sqrt{\\frac{x-2}{x-3}}$.",
    options: ["$(-\\infty, 2] \\cup (3, \\infty)$", "$[2, 3)$", "$(3, \\infty)$", "None of these"],
    correctAnswer: "$(-\\infty, 2] \\cup (3, \\infty)$"
  },
  {
    question: "If $f: \\mathbb{R} \\to \\mathbb{R}$ is periodic with period $T$, then the period of the shifted/scaled function $f(ax+b)$ is:",
    options: ["$\\frac{T}{|a|}$", "$aT$", "$\\frac{T}{a} + b$", "None of these"],
    correctAnswer: "$\\frac{T}{|a|}$"
  },
  {
    question: "The domain of the function $f(x) = \\log_x 2$ is:",
    options: ["$(0, 1) \\cup (1, \\infty)$", "$(0, \\infty)$", "$\\mathbb{R} \\setminus \\{1\\}$", "None of these"],
    correctAnswer: "$(0, 1) \\cup (1, \\infty)$"
  },
  {
    question: "The range of the function $f(x) = 3\\sin(x) + 4\\cos(x) + 5$ is:",
    options: ["$[0, 10]$", "$[-5, 5]$", "$[1, 9]$", "None of these"],
    correctAnswer: "$[0, 10]$"
  },
  {
    question: "If $f(x) = x^2$ and $g(x) = \\sqrt{x}$, then the domain of the composite function $f \\circ g$ is:",
    options: ["$[0, \\infty)$", "$\\mathbb{R}$", "$(0, \\infty)$", "None of these"],
    correctAnswer: "$[0, \\infty)$"
  },
  {
    question: "If $f(x) = \\sqrt{x - 1} + \\sqrt{5 - x}$, the range of $f(x)$ is:",
    options: ["$[2, 2\\sqrt{2}]$", "$[0, \\infty)$", "$[1, 5]$", "None of these"],
    correctAnswer: "$[2, 2\\sqrt{2}]$"
  },
  {
    question: "If $f(x) = \\frac{9^x}{9^x+3}$, find the value of the finite sum $\\sum_{r=1}^{20} f(r/21)$.",
    options: ["10", "20", "5", "None of these"],
    correctAnswer: "10"
  },
  {
    question: "The number of injective (one-one) functions from $\\{1, 2, 3\\}$ to $\\{1, 2, 3, 4, 5\\}$ is:",
    options: ["60", "120", "24", "None of these"],
    correctAnswer: "60"
  },
  {
    question: "Let $f(x) = \\sin x + \\cos(\\sqrt{a}x)$. If $f(x)$ is periodic, then $a$ must be:",
    options: ["A rational number", "An irrational number", "An integer", "None of these"],
    correctAnswer: "A rational number"
  },
  {
    question: "Let $f(x) = \\frac{x - [x]}{1 + x - [x]}$. The function $f$ is:",
    options: ["Neither one-one nor onto", "One-one and onto", "One-one but not onto", "Onto but not one-one"],
    correctAnswer: "Neither one-one nor onto"
  },
  {
    question: "Find the domain of the function $f(x) = \\frac{1}{\\log_{10}(1-x)} + \\sqrt{x+2}$.",
    options: ["$[-2, 0) \\cup (0, 1)$", "$[-2, 1]$", "$[-2, 0)$", "None of these"],
    correctAnswer: "$[-2, 0) \\cup (0, 1)$"
  },
  {
    question: "Let $f(x) = \\max(x, 1-x, 2)$. The range of the function $f(x)$ is:",
    options: ["$[2, \\infty)$", "$[1/2, \\infty)$", "$\\mathbb{R}$", "None of these"],
    correctAnswer: "$[2, \\infty)$"
  }
];

async function seed() {
  console.log('Connecting to database...');
  await connectDB();

  // Find class (Class 12)
  const classDoc = await Class.findOne({ classId: 12 });
  if (!classDoc) {
    console.error('Class 12 not found in classes collection!');
    process.exit(1);
  }
  const classId = classDoc._id;

  // Find chapters
  const relationChapter = await Chapter.findOne({ classId, normalizedChapterName: 'relation' });
  if (!relationChapter) {
    console.error('Relation chapter not found for Class 12!');
    process.exit(1);
  }
  const relationChapterId = relationChapter._id;

  const functionChapter = await Chapter.findOne({ classId, normalizedChapterName: 'function' });
  if (!functionChapter) {
    console.error('Function chapter not found for Class 12!');
    process.exit(1);
  }
  const functionChapterId = functionChapter._id;

  console.log(`Using classId: ${classId} ("Class 12")`);
  console.log(`Relation chapterId: ${relationChapterId}`);
  console.log(`Function chapterId: ${functionChapterId}`);

  let addedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  // 1. Seed Relation questions
  console.log('Seeding Relation questions...');
  for (let i = 0; i < relationQuestions.length; i++) {
    const qData = relationQuestions[i];
    const newQuestion = new Question({
      language: 'Both',
      classId: classId,
      chapterId: relationChapterId,
      question: qData.question,
      options: qData.options,
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
        console.error(`Error saving Relation question ${i + 1}: ${err.message}`);
        errorCount++;
      }
    }
  }

  // 2. Seed Function questions
  console.log('Seeding Function questions...');
  for (let i = 0; i < functionQuestions.length; i++) {
    const qData = functionQuestions[i];
    const newQuestion = new Question({
      language: 'Both',
      classId: classId,
      chapterId: functionChapterId,
      question: qData.question,
      options: qData.options,
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
        console.error(`Error saving Function question ${i + 1}: ${err.message}`);
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
