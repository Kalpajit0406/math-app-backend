/**
 * Seeding script to add 150 questions in Continuity and Differentiability chapter for Class 12.
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

// Fisher-Yates Shuffle
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const rawQuestions = [
  // ==========================================
  // EASY QUESTIONS (45 questions, 1 to 45)
  // ==========================================
  {
    question: "Derivative of $x^5$ with respect to $x$ is:",
    options: ["$5x^4$", "$4x^5$", "$5x^5$", "$x^4$"],
    correctAnswer: "$5x^4$"
  },
  {
    question: "Derivative of $\\sin(3x)$ is:",
    options: ["$3\\cos(3x)$", "$-3\\cos(3x)$", "$\\cos(3x)$", "$3\\sin(3x)$"],
    correctAnswer: "$3\\cos(3x)$"
  },
  {
    question: "Derivative of $e^{2x}$ is:",
    options: ["$2e^{2x}$", "$e^{2x}$", "$\\frac{1}{2}e^{2x}$", "$2e^x$"],
    correctAnswer: "$2e^{2x}$"
  },
  {
    question: "Derivative of $\\log_e(5x)$ is:",
    options: ["$\\frac{1}{x}$", "$\\frac{5}{x}$", "$\\frac{1}{5x}$", "$5$"],
    correctAnswer: "$\\frac{1}{x}$"
  },
  {
    question: "Derivative of $\\cos(x^2)$ is:",
    options: ["$-2x\\sin(x^2)$", "$2x\\sin(x^2)$", "$-\\sin(x^2)$", "$-\\sin(2x)$"],
    correctAnswer: "$-2x\\sin(x^2)$"
  },
  {
    question: "Derivative of $\\tan x$ is:",
    options: ["$\\sec^2 x$", "$-\\sec^2 x$", "$\\sec x \\tan x$", "$\\cot x$"],
    correctAnswer: "$\\sec^2 x$"
  },
  {
    question: "Derivative of $\\sec x$ is:",
    options: ["$\\sec x \\tan x$", "$\\sec^2 x$", "$\\tan^2 x$", "$-\\sec x \\tan x$"],
    correctAnswer: "$\\sec x \\tan x$"
  },
  {
    question: "Derivative of $\\cot(2x)$ is:",
    options: ["$-2\\csc^2(2x)$", "$-\\csc^2(2x)$", "$2\\csc^2(2x)$", "$-\\sec^2(2x)$"],
    correctAnswer: "$-2\\csc^2(2x)$"
  },
  {
    question: "Derivative of $\\csc x$ is:",
    options: ["$-\\csc x \\cot x$", "$\\csc x \\cot x$", "$-\\csc^2 x$", "$\\sec x \\tan x$"],
    correctAnswer: "$-\\csc x \\cot x$"
  },
  {
    question: "If $y = x^2 + 3x + 2$, find the second derivative $\\frac{d^2 y}{dx^2}$.",
    options: ["2", "$2x+3$", "0", "$x$"],
    correctAnswer: "2"
  },
  {
    question: "If $f(x) = 10$, find $f'(5)$.",
    options: ["0", "10", "5", "None of these"],
    correctAnswer: "0"
  },
  {
    question: "Derivative of $\\sqrt{x}$ is:",
    options: ["$\\frac{1}{2\\sqrt{x}}$", "$\\frac{2}{\\sqrt{x}}$", "$\\frac{1}{\\sqrt{x}}$", "$\\frac{1}{2}x^{1/2}$"],
    correctAnswer: "$\\frac{1}{2\\sqrt{x}}$"
  },
  {
    question: "If $f(x) = |x|$, find $f'(2)$.",
    options: ["1", "-1", "0", "Not defined"],
    correctAnswer: "1"
  },
  {
    question: "If $f(x) = |x|$, find $f'(-3)$.",
    options: ["-1", "1", "0", "Not defined"],
    correctAnswer: "-1"
  },
  {
    question: "If $y = \\log_{10} x$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{1}{x\\ln 10}$", "$\\frac{1}{x}$", "$\\frac{\\ln 10}{x}$", "$\\frac{10}{x}$"],
    correctAnswer: "$\\frac{1}{x\\ln 10}$"
  },
  {
    question: "Find the limit: $\\lim_{x \\to 2} \\frac{x^2 - 4}{x - 2}$.",
    options: ["4", "2", "0", "Not defined"],
    correctAnswer: "4"
  },
  {
    question: "Find the limit: $\\lim_{x \\to 0} \\frac{\\sin x}{x}$.",
    options: ["1", "0", "$\\infty$", "Not defined"],
    correctAnswer: "1"
  },
  {
    question: "Find the limit: $\\lim_{x \\to 0} \\frac{\\tan(2x)}{x}$.",
    options: ["2", "1", "0", "Not defined"],
    correctAnswer: "2"
  },
  {
    question: "Find the limit: $\\lim_{x \\to 0} \\frac{1 - \\cos x}{x}$.",
    options: ["0", "1", "$\\frac{1}{2}$", "Not defined"],
    correctAnswer: "0"
  },
  {
    question: "Find the limit: $\\lim_{x \\to 0} \\frac{e^x - 1}{x}$.",
    options: ["1", "0", "$e$", "Not defined"],
    correctAnswer: "1"
  },
  {
    question: "If $f(x) = k$ for $x \\le 2$ and $f(x) = 4$ for $x > 2$ is continuous at $x=2$, find $k$.",
    options: ["4", "2", "0", "None of these"],
    correctAnswer: "4"
  },
  {
    question: "Let $f(x) = 2x+1$ for $x \\le 1$ and $f(x) = a$ for $x > 1$. If $f$ is continuous at $x=1$, then $a$ is:",
    options: ["3", "2", "1", "0"],
    correctAnswer: "3"
  },
  {
    question: "The function $f(x) = \\frac{1}{x}$ is discontinuous at:",
    options: ["$x=0$", "$x=1$", "Everywhere", "Nowhere"],
    correctAnswer: "$x=0$"
  },
  {
    question: "The function $f(x) = [x]$ is discontinuous at:",
    options: ["All integers", "All real numbers", "All rational numbers", "Nowhere"],
    correctAnswer: "All integers"
  },
  {
    question: "Rolle's theorem is applicable to $f(x)$ on $[a, b]$ if $f(x)$ is:",
    options: [
      "Continuous on $[a,b]$ and differentiable on $(a,b)$ with $f(a)=f(b)$",
      "Continuous on $(a,b)$ and differentiable on $[a,b]$",
      "Continuous and differentiable everywhere",
      "None of these"
    ],
    correctAnswer: "Continuous on $[a,b]$ and differentiable on $(a,b)$ with $f(a)=f(b)$"
  },
  {
    question: "If $f(x)$ satisfies Rolle's theorem on $[a,b]$, then there exists at least one $c \\in (a,b)$ such that:",
    options: ["$f'(c) = 0$", "$f'(c) > 0$", "$f'(c) < 0$", "None of these"],
    correctAnswer: "$f'(c) = 0$"
  },
  {
    question: "The derivative of $a^x$ with respect to $x$ is:",
    options: ["$a^x \\ln a$", "$a^x$", "$x a^{x-1}$", "$\\frac{a^x}{\\ln a}$"],
    correctAnswer: "$a^x \\ln a$"
  },
  {
    question: "The derivative of $\\ln(x^3)$ is:",
    options: ["$\\frac{3}{x}$", "$\\frac{1}{x^3}$", "$\\frac{3}{x^3}$", "$3x$"],
    correctAnswer: "$\\frac{3}{x}$"
  },
  {
    question: "If $y = \\cos(3x+1)$, find $y'$.",
    options: ["$-3\\sin(3x+1)$", "$3\\sin(3x+1)$", "$-\\sin(3x+1)$", "$-3\\cos(3x+1)$"],
    correctAnswer: "$-3\\sin(3x+1)$"
  },
  {
    question: "If $y = x^3 - 3x$, find $y''$ at $x = 1$.",
    options: ["6", "3", "0", "-3"],
    correctAnswer: "6"
  },
  {
    question: "The derivative of $5^{2x}$ is:",
    options: ["$2 \\cdot 5^{2x} \\ln 5$", "$5^{2x} \\ln 5$", "$2 \\cdot 5^{2x}$", "$5^{2x}$"],
    correctAnswer: "$2 \\cdot 5^{2x} \\ln 5$"
  },
  {
    question: "The derivative of $\\ln(\\sin x)$ is:",
    options: ["$\\cot x$", "$\\tan x$", "$\\frac{1}{\\sin x}$", "$-\\cot x$"],
    correctAnswer: "$\\cot x$"
  },
  {
    question: "The derivative of $\\ln(\\cos x)$ is:",
    options: ["$-\\tan x$", "$\\tan x$", "$-\\cot x$", "$\\cot x$"],
    correctAnswer: "$-\\tan x$"
  },
  {
    question: "The derivative of $\\sqrt{2x+3}$ is:",
    options: ["$\\frac{1}{\\sqrt{2x+3}}$", "$\\frac{2}{\\sqrt{2x+3}}$", "$\\frac{1}{2\\sqrt{2x+3}}$", "None of these"],
    correctAnswer: "$\\frac{1}{\\sqrt{2x+3}}$"
  },
  {
    question: "The derivative of $\\arcsin x$ with respect to $x$ is:",
    options: ["$\\frac{1}{\\sqrt{1-x^2}}$", "$-\\frac{1}{\\sqrt{1-x^2}}$", "$\\frac{1}{1+x^2}$", "None of these"],
    correctAnswer: "$\\frac{1}{\\sqrt{1-x^2}}$"
  },
  {
    question: "The derivative of $\\arccos x$ is:",
    options: ["$-\\frac{1}{\\sqrt{1-x^2}}$", "$\\frac{1}{\\sqrt{1-x^2}}$", "$-\\frac{1}{1+x^2}$", "None of these"],
    correctAnswer: "$-\\frac{1}{\\sqrt{1-x^2}}$"
  },
  {
    question: "The derivative of $\\arctan x$ is:",
    options: ["$\\frac{1}{1+x^2}$", "$-\\frac{1}{1+x^2}$", "$\\frac{1}{\\sqrt{1-x^2}}$", "None of these"],
    correctAnswer: "$\\frac{1}{1+x^2}$"
  },
  {
    question: "The derivative of $\\cot^{-1} x$ is:",
    options: ["$-\\frac{1}{1+x^2}$", "$\\frac{1}{1+x^2}$", "$-\\frac{1}{\\sqrt{1-x^2}}$", "None of these"],
    correctAnswer: "$-\\frac{1}{1+x^2}$"
  },
  {
    question: "The derivative of $\\sec^{-1} x$ (for $|x| > 1$) is:",
    options: ["$\\frac{1}{|x|\\sqrt{x^2-1}}$", "$-\\frac{1}{|x|\\sqrt{x^2-1}}$", "$\\frac{1}{\\sqrt{x^2-1}}$", "None of these"],
    correctAnswer: "$\\frac{1}{|x|\\sqrt{x^2-1}}$"
  },
  {
    question: "The derivative of $\\csc^{-1} x$ (for $|x| > 1$) is:",
    options: ["$-\\frac{1}{|x|\\sqrt{x^2-1}}$", "$\\frac{1}{|x|\\sqrt{x^2-1}}$", "$-\\frac{1}{\\sqrt{x^2-1}}$", "None of these"],
    correctAnswer: "$-\\frac{1}{|x|\\sqrt{x^2-1}}$"
  },
  {
    question: "If $y = \\sin x$, find $y''$ at $x = \\pi/2$.",
    options: ["-1", "0", "1", "None of these"],
    correctAnswer: "-1"
  },
  {
    question: "If $f(x) = \\ln x$, find $f''(1)$.",
    options: ["-1", "1", "0", "Not defined"],
    correctAnswer: "-1"
  },
  {
    question: "Find $\\lim_{x \\to 1} \\frac{x^3 - 1}{x - 1}$.",
    options: ["3", "1", "0", "Not defined"],
    correctAnswer: "3"
  },
  {
    question: "Find the derivative of $\\cos(\\sin x)$.",
    options: ["$-\\sin(\\sin x) \\cos x$", "$\\sin(\\sin x) \\cos x$", "$-\\sin(\\sin x)$", "$-\\cos(\\sin x) \\cos x$"],
    correctAnswer: "$-\\sin(\\sin x) \\cos x$"
  },
  {
    question: "Find the derivative of $x \\ln x$.",
    options: ["$\\ln x + 1$", "$\\ln x$", "$1$", "$\\frac{1}{x}$"],
    correctAnswer: "$\\ln x + 1$"
  },

  // ==========================================
  // MEDIUM QUESTIONS (45 questions, 46 to 90)
  // ==========================================
  {
    question: "Find the derivative of $\\ln(\\sec x + \\tan x)$.",
    options: ["$\\sec x$", "$\\sec x \\tan x$", "$\\sec^2 x$", "None of these"],
    correctAnswer: "$\\sec x$"
  },
  {
    question: "Find the derivative of $\\ln(\\csc x - \\cot x)$.",
    options: ["$\\csc x$", "$-\\csc x$", "$\\csc x \\cot x$", "None of these"],
    correctAnswer: "$\\csc x$"
  },
  {
    question: "If $y = \\sqrt{x + \\sqrt{x + \\dots \\text{ to } \\infty}}$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{1}{2y-1}$", "$\\frac{y}{2y-1}$", "$\\frac{1}{y-1}$", "None of these"],
    correctAnswer: "$\\frac{1}{2y-1}$"
  },
  {
    question: "If $x = a \\cos t$, $y = b \\sin t$, find $\\frac{dy}{dx}$.",
    options: ["$-\\frac{b}{a}\\cot t$", "$\\frac{b}{a}\\tan t$", "$-\\frac{b}{a}\\tan t$", "$\\frac{b}{a}\\cot t$"],
    correctAnswer: "$-\\frac{b}{a}\\cot t$"
  },
  {
    question: "If $x = a t^2$, $y = 2at$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{1}{t}$", "$t$", "$-\\frac{1}{t}$", "$\\frac{2}{t}$"],
    correctAnswer: "$\\frac{1}{t}$"
  },
  {
    question: "If $x^2 + y^2 = a^2$, find $\\frac{dy}{dx}$.",
    options: ["$-\\frac{x}{y}$", "$-\\frac{y}{x}$", "$\\frac{x}{y}$", "$\\frac{y}{x}$"],
    correctAnswer: "$-\\frac{x}{y}$"
  },
  {
    question: "If $xy = c^2$, find $\\frac{dy}{dx}$.",
    options: ["$-\\frac{y}{x}$", "$-\\frac{x}{y}$", "$\\frac{y}{x}$", "$\\frac{x}{y}$"],
    correctAnswer: "$-\\frac{y}{x}$"
  },
  {
    question: "Derivative of $e^{\\cos x}$ is:",
    options: ["$-\\sin x e^{\\cos x}$", "$\\sin x e^{\\cos x}$", "$-\\cos x e^{\\cos x}$", "$e^{\\cos x}$"],
    correctAnswer: "$-\\sin x e^{\\cos x}$"
  },
  {
    question: "If $y = x^x$, find $\\frac{dy}{dx}$.",
    options: ["$x^x(1 + \\ln x)$", "$x^x \\ln x$", "$x \\cdot x^{x-1}$", "None of these"],
    correctAnswer: "$x^x(1 + \\ln x)$"
  },
  {
    question: "Find the derivative of $\\arcsin(2x\\sqrt{1-x^2})$ for $-\\frac{1}{\\sqrt{2}} < x < \\frac{1}{\\sqrt{2}}$.",
    options: ["$\\frac{2}{\\sqrt{1-x^2}}$", "$-\\frac{2}{\\sqrt{1-x^2}}$", "$\\frac{1}{\\sqrt{1-x^2}}$", "None of these"],
    correctAnswer: "$\\frac{2}{\\sqrt{1-x^2}}$"
  },
  {
    question: "Find the derivative of $\\arccos(2x^2 - 1)$ for $0 < x < 1$.",
    options: ["$-\\frac{2}{\\sqrt{1-x^2}}$", "$\\frac{2}{\\sqrt{1-x^2}}$", "$-\\frac{1}{\\sqrt{1-x^2}}$", "None of these"],
    correctAnswer: "$-\\frac{2}{\\sqrt{1-x^2}}$"
  },
  {
    question: "Find the derivative of $\\arctan\\left(\\frac{2x}{1-x^2}\\right)$ for $-1 < x < 1$.",
    options: ["$\\frac{2}{1+x^2}$", "$\\frac{1}{1+x^2}$", "$-\\frac{2}{1+x^2}$", "None of these"],
    correctAnswer: "$\\frac{2}{1+x^2}$"
  },
  {
    question: "Find the derivative of $\\arcsin\\left(\\frac{2x}{1+x^2}\\right)$ for $-1 < x < 1$.",
    options: ["$\\frac{2}{1+x^2}$", "$\\frac{1}{1+x^2}$", "$-\\frac{2}{1+x^2}$", "None of these"],
    correctAnswer: "$\\frac{2}{1+x^2}$"
  },
  {
    question: "Find the derivative of $\\arccos\\left(\\frac{1-x^2}{1+x^2}\\right)$ for $0 < x < \\infty$.",
    options: ["$\\frac{2}{1+x^2}$", "$\\frac{1}{1+x^2}$", "$-\\frac{2}{1+x^2}$", "None of these"],
    correctAnswer: "$\\frac{2}{1+x^2}$"
  },
  {
    question: "Find the derivative of $\\arctan\\left(\\frac{3x-x^3}{1-3x^2}\\right)$ for $-\\frac{1}{\\sqrt{3}} < x < \\frac{1}{\\sqrt{3}}$.",
    options: ["$\\frac{3}{1+x^2}$", "$\\frac{1}{1+x^2}$", "$-\\frac{3}{1+x^2}$", "None of these"],
    correctAnswer: "$\\frac{3}{1+x^2}$"
  },
  {
    question: "If $y = \\ln(\\ln x)$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{1}{x\\ln x}$", "$\\frac{1}{\\ln x}$", "$\\frac{1}{x}$", "None of these"],
    correctAnswer: "$\\frac{1}{x\\ln x}$"
  },
  {
    question: "Find the derivative of $x^2 \\sin x$.",
    options: ["$2x\\sin x + x^2\\cos x$", "$2x\\sin x - x^2\\cos x$", "$2x\\cos x$", "None of these"],
    correctAnswer: "$2x\\sin x + x^2\\cos x$"
  },
  {
    question: "Find the derivative of $\\frac{\\sin x}{x}$.",
    options: ["$\\frac{x\\cos x - \\sin x}{x^2}$", "$\\frac{\\sin x - x\\cos x}{x^2}$", "$\\frac{\\cos x}{1}$", "None of these"],
    correctAnswer: "$\\frac{x\\cos x - \\sin x}{x^2}$"
  },
  {
    question: "If $x = a(\\theta - \\sin \\theta)$, $y = a(1 - \\cos \\theta)$, find $\\frac{dy}{dx}$.",
    options: ["$\\cot(\\theta/2)$", "$\\tan(\\theta/2)$", "$-\\cot(\\theta/2)$", "$-\\tan(\\theta/2)$"],
    correctAnswer: "$\\cot(\\theta/2)$"
  },
  {
    question: "If $x = a(\\theta + \\sin \\theta)$, $y = a(1 - \\cos \\theta)$, find $\\frac{dy}{dx}$.",
    options: ["$\\tan(\\theta/2)$", "$\\cot(\\theta/2)$", "$-\\tan(\\theta/2)$", "$-\\cot(\\theta/2)$"],
    correctAnswer: "$\\tan(\\theta/2)$"
  },
  {
    question: "Find the derivative of $2^{\\sin x}$.",
    options: ["$2^{\\sin x} \\cos x \\ln 2$", "$2^{\\sin x} \\cos x$", "$2^{\\sin x} \\ln 2$", "None of these"],
    correctAnswer: "$2^{\\sin x} \\cos x \\ln 2$"
  },
  {
    question: "Find the derivative of $\\ln(\\sqrt{x-1} + \\sqrt{x-2})$.",
    options: ["$\\frac{1}{2\\sqrt{(x-1)(x-2)}}$", "$\\frac{1}{\\sqrt{(x-1)(x-2)}}$", "$\\frac{1}{2\\sqrt{x-1}\\sqrt{x-2}}$", "None of these"],
    correctAnswer: "$\\frac{1}{2\\sqrt{(x-1)(x-2)}}$"
  },
  {
    question: "If $f(x) = \\frac{\\sin x + \\cos x}{\\sin x - \\cos x}$, find the derivative value $f'(0)$.",
    options: ["2", "-2", "1", "-1"],
    correctAnswer: "-2"
  },
  {
    question: "If $f(x) = x^2 - x + 1$ is continuous at $x=1$, then find $\\lim_{x \\to 1} f(x)$.",
    options: ["1", "0", "2", "3"],
    correctAnswer: "1"
  },
  {
    question: "Find the derivative of $\\ln(\\ln(\\ln x))$.",
    options: ["$\\frac{1}{x\\ln x \\ln(\\ln x)}$", "$\\frac{1}{x\\ln x}$", "$\\frac{1}{x}$", "None of these"],
    correctAnswer: "$\\frac{1}{x\\ln x \\ln(\\ln x)}$"
  },
  {
    question: "If $y = \\sqrt{\\sin x + y}$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{\\cos x}{2y-1}$", "$\\frac{\\sin x}{2y-1}$", "$\\frac{\\cos x}{2y+1}$", "None of these"],
    correctAnswer: "$\\frac{\\cos x}{2y-1}$"
  },
  {
    question: "If $y = \\sqrt{\\ln x + y}$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{1}{x(2y-1)}$", "$\\frac{1}{2y-1}$", "$\\frac{1}{x(2y+1)}$", "None of these"],
    correctAnswer: "$\\frac{1}{x(2y-1)}$"
  },
  {
    question: "Let $f(x) = \\frac{x^2 - 9}{x - 3}$ for $x \\neq 3$. Find the value of $f(3)$ so that the function is continuous at $x=3$.",
    options: ["6", "3", "0", "9"],
    correctAnswer: "6"
  },
  {
    question: "Let $f(x) = \\frac{\\sin(5x)}{x}$ for $x \\neq 0$. Find the value of $f(0)$ so that the function is continuous at $x=0$.",
    options: ["5", "1", "0", "Not defined"],
    correctAnswer: "5"
  },
  {
    question: "Let $f(x) = \\frac{1-\\cos(4x)}{x^2}$ for $x \\neq 0$. Find $f(0)$ to make the function continuous at $x=0$.",
    options: ["8", "4", "2", "16"],
    correctAnswer: "8"
  },
  {
    question: "If $f(x) = \\log_{x} e$, find $f'(x)$.",
    options: ["$-\\frac{1}{x(\\ln x)^2}$", "$\\frac{1}{x}$", "$-\\frac{1}{x\\ln x}$", "None of these"],
    correctAnswer: "$-\\frac{1}{x(\\ln x)^2}$"
  },
  {
    question: "The derivative of $\\ln(x + \\sqrt{x^2+a^2})$ is:",
    options: ["$\\frac{1}{\\sqrt{x^2+a^2}}$", "$\\frac{1}{x+\\sqrt{x^2+a^2}}$", "$\\frac{x}{\\sqrt{x^2+a^2}}$", "None of these"],
    correctAnswer: "$\\frac{1}{\\sqrt{x^2+a^2}}$"
  },
  {
    question: "The derivative of $\\ln(x + \\sqrt{x^2-a^2})$ is:",
    options: ["$\\frac{1}{\\sqrt{x^2-a^2}}$", "$\\frac{1}{x+\\sqrt{x^2-a^2}}$", "$\\frac{x}{\\sqrt{x^2-a^2}}$", "None of these"],
    correctAnswer: "$\\frac{1}{\\sqrt{x^2-a^2}}$"
  },
  {
    question: "If $y = \\ln\\left(\\frac{1-\\cos x}{1+\\cos x}\\right)$, find $\\frac{dy}{dx}$.",
    options: ["$2\\csc x$", "$\\csc x$", "$2\\sec x$", "$\\sec x$"],
    correctAnswer: "$2\\csc x$"
  },
  {
    question: "If $y = \\ln\\left(\\sqrt{\\frac{1-\\sin x}{1+\\sin x}}\\right)$, find $\\frac{dy}{dx}$.",
    options: ["$-\\sec x$", "$\\sec x$", "$-\\csc x$", "$\\csc x$"],
    correctAnswer: "$-\\sec x$"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{\\cos x + \\sin x}{\\cos x - \\sin x}\\right)$, find $\\frac{dy}{dx}$.",
    options: ["1", "-1", "0", "$\\frac{1}{2}$"],
    correctAnswer: "1"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{\\cos x - \\sin x}{\\cos x + \\sin x}\\right)$, find $\\frac{dy}{dx}$.",
    options: ["-1", "1", "0", "$\\frac{1}{2}$"],
    correctAnswer: "-1"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{\\sin x}{1+\\cos x}\\right)$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{1}{2}$", "1", "-$\\frac{1}{2}$", "-1"],
    correctAnswer: "$\\frac{1}{2}$"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{1-\\cos x}{\\sin x}\\right)$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{1}{2}$", "1", "-$\\frac{1}{2}$", "-1"],
    correctAnswer: "$\\frac{1}{2}$"
  },
  {
    question: "If $y = \\sin^{-1}(\\cos x)$, find $\\frac{dy}{dx}$.",
    options: ["-1", "1", "$\\frac{1}{\\sqrt{1-x^2}}$", "None of these"],
    correctAnswer: "-1"
  },
  {
    question: "Find the derivative of $\\ln(\\sec x)$.",
    options: ["$\\tan x$", "$\\sec x$", "$-\\tan x$", "$\\cot x$"],
    correctAnswer: "$\\tan x$"
  },
  {
    question: "If $f(x) = \\log_{10}(\\log_{10} x)$, find $f'(x)$.",
    options: ["$\\frac{1}{x\\ln x \\ln 10}$", "$\\frac{1}{x\\ln x}$", "$\\frac{1}{x \\ln 10}$", "None of these"],
    correctAnswer: "$\\frac{1}{x\\ln x \\ln 10}$"
  },
  {
    question: "Let $f(x) = \\frac{|x-1|}{x-1}$ for $x \\neq 1$. Is $f(x)$ continuous at $x=1$?",
    options: ["No, LHL is -1 and RHL is 1", "Yes, LHL = RHL = 0", "Yes, LHL = RHL = 1", "None of these"],
    correctAnswer: "No, LHL is -1 and RHL is 1"
  },
  {
    question: "The function $f(x) = |x| + |x-1|$ is classified as:",
    options: [
      "Continuous everywhere but not differentiable at $x=0, 1$",
      "Continuous and differentiable everywhere",
      "Discontinuous at $x=0, 1$",
      "None of these"
    ],
    correctAnswer: "Continuous everywhere but not differentiable at $x=0, 1$"
  },
  {
    question: "If $y = e^{3\\ln x}$, find $\\frac{dy}{dx}$.",
    options: ["$3x^2$", "$e^{3\\ln x}$", "$3x^2 e^{3\\ln x}$", "$\\frac{3}{x}$"],
    correctAnswer: "$3x^2$"
  },

  // ==========================================
  // HARD QUESTIONS (60 questions, 91 to 150)
  // ==========================================
  {
    question: "If $y = x^y$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{y^2}{x(1-y\\ln x)}$", "$\\frac{y}{x(1-y\\ln x)}$", "$\\frac{y^2}{1-y\\ln x}$", "None of these"],
    correctAnswer: "$\\frac{y^2}{x(1-y\\ln x)}$"
  },
  {
    question: "If $x^y = y^x$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{y(y - x\\ln y)}{x(x - y\\ln x)}$", "$\\frac{y(x\\ln y - y)}{x(y\\ln x - x)}$", "$\\frac{x(y - x\\ln y)}{y(x - y\\ln x)}$", "None of these"],
    correctAnswer: "$\\frac{y(y - x\\ln y)}{x(x - y\\ln x)}$"
  },
  {
    question: "If $y = x^{x^x}$, find $\\frac{dy}{dx}$.",
    options: [
      "$y \\cdot x^x \\left(\\frac{1}{x} + \\ln x(1 + \\ln x)\\right)$",
      "$y \\cdot x^x(1 + \\ln x)$",
      "$x^{x^x}(1 + \\ln x)$",
      "None of these"
    ],
    correctAnswer: "$y \\cdot x^x \\left(\\frac{1}{x} + \\ln x(1 + \\ln x)\\right)$"
  },
  {
    question: "If $y = (\\sin x)^{\\cos x}$, find $\\frac{dy}{dx}$.",
    options: ["$y(\\cos x \\cot x - \\sin x \\ln(\\sin x))$", "$y(\\cos x \\cot x + \\sin x \\ln(\\sin x))$", "$y(\\cos^2 x - \\sin^2 x)$", "None of these"],
    correctAnswer: "$y(\\cos x \\cot x - \\sin x \\ln(\\sin x))$"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{\\sqrt{1+x^2}-1}{x}\right)$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{1}{2(1+x^2)}$", "$\\frac{1}{1+x^2}$", "$-\\frac{1}{2(1+x^2)}$", "None of these"],
    correctAnswer: "$\\frac{1}{2(1+x^2)}$"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{\\sqrt{1+x^2}+1}{x}\right)$, find $\\frac{dy}{dx}$.",
    options: ["$-\\frac{1}{2(1+x^2)}$", "$\\frac{1}{2(1+x^2)}$", "$-\\frac{1}{1+x^2}$", "None of these"],
    correctAnswer: "$-\\frac{1}{2(1+x^2)}$"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{\\sqrt{1-x^2}}{1+x}\\right)$, find $\\frac{dy}{dx}$.",
    options: ["$-\\frac{1}{2\\sqrt{1-x^2}}$", "$\\frac{1}{2\\sqrt{1-x^2}}$", "$-\\frac{1}{\\sqrt{1-x^2}}$", "None of these"],
    correctAnswer: "$-\\frac{1}{2\\sqrt{1-x^2}}$"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{x}{\\sqrt{1-x^2}}\\right)$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{1}{\\sqrt{1-x^2}}$", "$-\\frac{1}{\\sqrt{1-x^2}}$", "$\\frac{1}{1-x^2}$", "None of these"],
    correctAnswer: "$\\frac{1}{\\sqrt{1-x^2}}$"
  },
  {
    question: "If $f(x) = \\begin{cases} ax^2 + b & x \\le 1 \\\\ x^2 + 2 & x > 1 \\end{cases}$ is differentiable at $x=1$, find the values of $a$ and $b$.",
    options: ["$a=1, b=2$", "$a=2, b=1$", "$a=1, b=1$", "None of these"],
    correctAnswer: "$a=1, b=2$"
  },
  {
    question: "If $f(x) = \\begin{cases} ax + b & x \\le 2 \\\\ x^2 - x & x > 2 \\end{cases}$ is differentiable at $x=2$, find the values of $a$ and $b$.",
    options: ["$a=3, b=-4$", "$a=3, b=4$", "$a=2, b=-2$", "None of these"],
    correctAnswer: "$a=3, b=-4$"
  },
  {
    question: "If $y = a \\cos(\\ln x) + b \\sin(\\ln x)$, then which of the following differential equations is satisfied?",
    options: ["$x^2 y_2 + x y_1 + y = 0$", "$x^2 y_2 - x y_1 + y = 0$", "$x^2 y_2 + x y_1 - y = 0$", "None of these"],
    correctAnswer: "$x^2 y_2 + x y_1 + y = 0$"
  },
  {
    question: "If $y = (\\sin^{-1} x)^2$, then which of the following equations is satisfied?",
    options: ["$(1-x^2)y_2 - x y_1 - 2 = 0$", "$(1-x^2)y_2 - x y_1 + 2 = 0$", "$(1-x^2)y_2 + x y_1 - 2 = 0$", "None of these"],
    correctAnswer: "$(1-x^2)y_2 - x y_1 - 2 = 0$"
  },
  {
    question: "If $y = e^{a \\cos^{-1} x}$, then which of the following equations is satisfied?",
    options: ["$(1-x^2)y_2 - x y_1 - a^2 y = 0$", "$(1-x^2)y_2 - x y_1 + a^2 y = 0$", "$(1-x^2)y_2 + x y_1 - a^2 y = 0$", "None of these"],
    correctAnswer: "$(1-x^2)y_2 - x y_1 - a^2 y = 0$"
  },
  {
    question: "Let $f(x) = x^2 \\sin(1/x)$ for $x \\neq 0$ and $f(0) = 0$. Find the derivative $f'(0)$.",
    options: ["0", "1", "Not defined", "None of these"],
    correctAnswer: "0"
  },
  {
    question: "Let $f(x) = x \\sin(1/x)$ for $x \\neq 0$ and $f(0) = 0$. Is $f(x)$ differentiable at $x=0$?",
    options: ["No, limit of $f(h)/h$ does not exist", "Yes, $f'(0)=0$", "Yes, $f'(0)=1$", "None of these"],
    correctAnswer: "No, limit of $f(h)/h$ does not exist"
  },
  {
    question: "Find the derivative of $\\sec(x^\\circ)$ with respect to $x$.",
    options: ["$\\frac{\\pi}{180}\\sec(x^\\circ)\\tan(x^\\circ)$", "$\\sec(x^\\circ)\\tan(x^\\circ)$", "$-\\frac{\\pi}{180}\\sec(x^\\circ)\\tan(x^\\circ)$", "None of these"],
    correctAnswer: "$\\frac{\\pi}{180}\\sec(x^\\circ)\\tan(x^\\circ)$"
  },
  {
    question: "If $y = \\sqrt{\\sin x + \\sqrt{\\sin x + \\dots \\text{ to } \\infty}}$, then $(2y-1)\\frac{dy}{dx}$ is equal to:",
    options: ["$\\cos x$", "$-\\cos x$", "$\\sin x$", "$-\\sin x$"],
    correctAnswer: "$\\cos x$"
  },
  {
    question: "If $y = x^2 + \\frac{1}{x^2 + \\frac{1}{x^2 + \\dots \\text{ to } \\infty}}$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{2x y}{2y - x^2}$", "$\\frac{2x y}{2y + x^2}$", "$\\frac{2x}{2y - x^2}$", "None of these"],
    correctAnswer: "$\\frac{2x y}{2y - x^2}$"
  },
  {
    question: "If $e^x + e^y = e^{x+y}$, find the derivative $\\frac{dy}{dx}$.",
    options: ["$-e^{y-x}$", "$e^{y-x}$", "$-e^{x-y}$", "$e^{x-y}$"],
    correctAnswer: "$-e^{y-x}$"
  },
  {
    question: "If $\\sin y = x \\sin(a+y)$ with $\\sin a \\neq 0$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{\\sin^2(a+y)}{\\sin a}$", "$\\frac{\\sin^2(a+y)}{\\cos a}$", "$-\\frac{\\sin^2(a+y)}{\\sin a}$", "None of these"],
    correctAnswer: "$\\frac{\\sin^2(a+y)}{\\sin a}$"
  },
  {
    question: "If $\\cos y = x \\cos(a+y)$ with $\\cos a \\neq 0$, find $\\frac{dy}{dx}$.",
    options: ["$\\frac{\\cos^2(a+y)}{\\sin a}$", "$\\frac{\\cos^2(a+y)}{\\cos a}$", "$-\\frac{\\cos^2(a+y)}{\\sin a}$", "None of these"],
    correctAnswer: "$\\frac{\\cos^2(a+y)}{\\sin a}$"
  },
  {
    question: "Find the derivative of $\\sin^2 x$ with respect to $e^{\\cos x}$.",
    options: ["$-\\frac{2\\cos x}{e^{\\cos x}}$", "$\\frac{2\\cos x}{e^{\\cos x}}$", "$-\\frac{2\\sin x}{e^{\\cos x}}$", "None of these"],
    correctAnswer: "$-\\frac{2\\cos x}{e^{\\cos x}}$"
  },
  {
    question: "Find the derivative of $\\ln x$ with respect to $\\cot x$.",
    options: ["$-\\frac{\\sin^2 x}{x}$", "$\\frac{\\sin^2 x}{x}$", "$-\\frac{\\csc^2 x}{x}$", "None of these"],
    correctAnswer: "$-\\frac{\\sin^2 x}{x}$"
  },
  {
    question: "Find the derivative of $\\sec^{-1}\\left(\\frac{1}{2x^2-1}\\right)$ with respect to $\\sqrt{1-x^2}$ for $0 < x < \\frac{1}{\\sqrt{2}}$.",
    options: ["$\\frac{2}{x}$", "$-\\frac{2}{x}$", "$\\frac{2}{x\\sqrt{1-x^2}}$", "None of these"],
    correctAnswer: "$\\frac{2}{x}$"
  },
  {
    question: "If $y = (x^2-1)^n$, find the $n$-th derivative $y^{(n)}$ at $x=1$.",
    options: ["$2^n n!$", "$n!$", "$2^n$", "0"],
    correctAnswer: "$2^n n!$"
  },
  {
    question: "Find the derivative of the rational form $\\ln\\left(\\frac{x^2+x+1}{x^2-x+1}\\right)$.",
    options: ["$\\frac{2(1-x^2)}{x^4+x^2+1}$", "$\\frac{2(1+x^2)}{x^4+x^2+1}$", "$\\frac{2x(1-x^2)}{x^4+x^2+1}$", "None of these"],
    correctAnswer: "$\\frac{2(1-x^2)}{x^4+x^2+1}$"
  },
  {
    question: "Let $f(x) = [x]^2 - [x^2]$. Find the points of discontinuity of $f(x)$ on $[0, 2]$.",
    options: ["$\\{1, \\sqrt{2}, \\sqrt{3}, 2\\}$", "All integers in $[0, 2]$ except 0", "All integers in $[0, 2]$", "None of these"],
    correctAnswer: "$\\{1, \\sqrt{2}, \\sqrt{3}, 2\\}$"
  },
  {
    question: "Let $f(x) = \\lim_{n \\to \\infty} \\frac{\\log(2+x) - x^{2n} \\sin x}{1 + x^{2n}}$. Find the point of discontinuity of $f(x)$ for $x > 0$.",
    options: ["$x=1$", "$x=2$", "$x=0$", "None of these"],
    correctAnswer: "$x=1$"
  },
  {
    question: "Let $f(x) = \\begin{cases} \\frac{\\sin(a+1)x + \\sin x}{x} & x < 0 \\\\ c & x = 0 \\\\ \\frac{\\sqrt{x+bx^2} - \\sqrt{x}}{b x^{3/2}} & x > 0 \\end{cases}$ is continuous at $x=0$. Find the values of $a$ and $c$ (assuming $b \\neq 0$).",
    options: ["$a = -3/2, c = 1/2$", "$a = 1/2, c = -3/2$", "$a = -1/2, c = 1/2$", "None of these"],
    correctAnswer: "$a = -3/2, c = 1/2$"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{\\sqrt{1+x^2} + \\sqrt{1-x^2}}{\\sqrt{1+x^2} - \\sqrt{1-x^2}}\\right)$, find $\\frac{dy}{dx}$ for $0 < |x| < 1$.",
    options: ["$-\\frac{x}{\\sqrt{1-x^4}}$", "$\\frac{x}{\\sqrt{1-x^4}}$", "$-\\frac{1}{2\\sqrt{1-x^4}}$", "None of these"],
    correctAnswer: "$-\\frac{x}{\\sqrt{1-x^4}}$"
  },
  {
    question: "Find the derivative of $x^{\\ln x}$ with respect to $x$.",
    options: ["$2x^{\\ln x - 1} \\ln x$", "$x^{\\ln x - 1} \\ln x$", "$2x^{\\ln x} \\ln x$", "None of these"],
    correctAnswer: "$2x^{\\ln x - 1} \\ln x$"
  },
  {
    question: "If $y = \\sin(\\ln x)$, then which of the following differential equations is satisfied?",
    options: ["$x^2 y_2 + x y_1 + y = 0$", "$x^2 y_2 - x y_1 + y = 0$", "$x^2 y_2 + x y_1 - y = 0$", "None of these"],
    correctAnswer: "$x^2 y_2 + x y_1 + y = 0$"
  },
  {
    question: "If $y = x + e^x$, find the second derivative $\\frac{d^2 x}{dy^2}$.",
    options: ["$-\\frac{e^x}{(1+e^x)^3}$", "$\\frac{e^x}{(1+e^x)^3}$", "$-\\frac{e^x}{(1+e^x)^2}$", "None of these"],
    correctAnswer: "$-\\frac{e^x}{(1+e^x)^3}$"
  },
  {
    question: "If $y = x^x + x^{1/x}$, find the derivative value $y'(1)$.",
    options: ["2", "1", "0", "3"],
    correctAnswer: "2"
  },
  {
    question: "If $f(x) = \\ln\\left(x + \\sqrt{x^2+1}\\right)$, find the expression $f'(x) \\sqrt{x^2+1}$.",
    options: ["1", "0", "$x$", "None of these"],
    correctAnswer: "1"
  },
  {
    question: "If $y = \\sqrt{\\tan x + \\sqrt{\\tan x + \\dots \\text{ to } \\infty}}$, find $(2y-1)\\frac{dy}{dx}$.",
    options: ["$\\sec^2 x$", "$-\\sec^2 x$", "$\\tan x$", "None of these"],
    correctAnswer: "$\\sec^2 x$"
  },
  {
    question: "If $y = e^x \\cos x$, then which of the following differential equations is satisfied?",
    options: ["$y_2 - 2y_1 + 2y = 0$", "$y_2 + 2y_1 - 2y = 0$", "$y_2 - 2y_1 - 2y = 0$", "None of these"],
    correctAnswer: "$y_2 - 2y_1 + 2y = 0$"
  },
  {
    question: "If $y = A e^{mx} + B e^{nx}$, then which of the following differential equations is satisfied?",
    options: ["$y_2 - (m+n)y_1 + mny = 0$", "$y_2 + (m+n)y_1 + mny = 0$", "$y_2 - (m+n)y_1 - mny = 0$", "None of these"],
    correctAnswer: "$y_2 - (m+n)y_1 + mny = 0$"
  },
  {
    question: "If $y = \\sin(m \\sin^{-1} x)$, then which of the following differential equations is satisfied?",
    options: ["$(1-x^2)y_2 - x y_1 + m^2 y = 0$", "$(1-x^2)y_2 - x y_1 - m^2 y = 0$", "$(1-x^2)y_2 + x y_1 + m^2 y = 0$", "None of these"],
    correctAnswer: "$(1-x^2)y_2 - x y_1 + m^2 y = 0$"
  },
  {
    question: "If $y = \\cos(m \\sin^{-1} x)$, then which of the following differential equations is satisfied?",
    options: ["$(1-x^2)y_2 - x y_1 + m^2 y = 0$", "$(1-x^2)y_2 - x y_1 - m^2 y = 0$", "$(1-x^2)y_2 + x y_1 + m^2 y = 0$", "None of these"],
    correctAnswer: "$(1-x^2)y_2 - x y_1 + m^2 y = 0$"
  },
  {
    question: "The function $f(x) = x^2 - 1$ on $[-1, 1]$ satisfies Rolle's theorem. Find the value of the parameter $c$.",
    options: ["0", "0.5", "-0.5", "None of these"],
    correctAnswer: "0"
  },
  {
    question: "The function $f(x) = x(x-3)$ on $[0, 3]$ satisfies Rolle's theorem. Find the value of the parameter $c$.",
    options: ["1.5", "1", "2", "None of these"],
    correctAnswer: "1.5"
  },
  {
    question: "The function $f(x) = \\sin x$ on $[0, \\pi]$ satisfies Rolle's theorem. Find the value of the parameter $c$.",
    options: ["$\\frac{\\pi}{2}$", "$\\frac{\\pi}{4}$", "$\\frac{3\\pi}{4}$", "None of these"],
    correctAnswer: "$\\frac{\\pi}{2}$"
  },
  {
    question: "Find the value of the parameter $c$ for the function $f(x) = x(x-1)$ on $[0, 1]$ satisfying Rolle's theorem.",
    options: ["0.5", "0.25", "0.75", "None of these"],
    correctAnswer: "0.5"
  },
  {
    question: "Find the value of $c$ for the function $f(x) = x^2$ on $[2, 4]$ satisfying Lagrange's Mean Value Theorem.",
    options: ["3", "2.8", "3.2", "None of these"],
    correctAnswer: "3"
  },
  {
    question: "Find the value of $c$ for the logarithmic function $f(x) = \\ln x$ on $[1, e]$ satisfying Lagrange's Mean Value Theorem.",
    options: ["$e-1$", "$\\frac{e-1}{e}$", "$e$", "None of these"],
    correctAnswer: "$e-1$"
  },
  {
    question: "Find the value of $c$ for the polynomial $f(x) = x^3 - x$ on $[1, 2]$ satisfying Lagrange's Mean Value Theorem.",
    options: ["$\\sqrt{7/3}$", "$\\sqrt{5/3}$", "$\\sqrt{3}$", "None of these"],
    correctAnswer: "$\\sqrt{7/3}$"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{\\sqrt{1+x}-\\sqrt{1-x}}{\\sqrt{1+x}+\\sqrt{1-x}}\\right)$, find $\\frac{dy}{dx}$ for $0 < x < 1$.",
    options: ["$\\frac{1}{2\\sqrt{1-x^2}}$", "$-\\frac{1}{2\\sqrt{1-x^2}}$", "$\\frac{1}{\\sqrt{1-x^2}}$", "None of these"],
    correctAnswer: "$\\frac{1}{2\\sqrt{1-x^2}}$"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{\\sqrt{1+x}+\\sqrt{1-x}}{\\sqrt{1+x}-\\sqrt{1-x}}\\right)$, find $\\frac{dy}{dx}$ for $0 < x < 1$.",
    options: ["$-\\frac{1}{2\\sqrt{1-x^2}}$", "$\\frac{1}{2\\sqrt{1-x^2}}$", "$-\\frac{1}{\\sqrt{1-x^2}}$", "None of these"],
    correctAnswer: "$-\\frac{1}{2\\sqrt{1-x^2}}$"
  },
  {
    question: "If $y = \\sin^{-1}\\left(\\frac{2^{x+1}}{1+4^x}\right)$, find the derivative $\\frac{dy}{dx}$.",
    options: ["$\\frac{2^{x+1} \\ln 2}{1+4^x}$", "$\\frac{2^x \\ln 2}{1+4^x}$", "$-\\frac{2^{x+1} \\ln 2}{1+4^x}$", "None of these"],
    correctAnswer: "$\\frac{2^{x+1} \\ln 2}{1+4^x}$"
  },
  {
    question: "Find the derivative of $\\cos^3 x$ with respect to $\\sin^3 x$.",
    options: ["$-\\cot x$", "$\\cot x$", "$-\\tan x$", "$\\tan x$"],
    correctAnswer: "$-\\cot x$"
  },
  {
    question: "Find the derivative of $\\sec x$ with respect to $\\tan x$.",
    options: ["$\\sin x$", "$\\cos x$", "$-\\sin x$", "$\\csc x$"],
    correctAnswer: "$\\sin x$"
  },
  {
    question: "If $f(x) = x^3 \\operatorname{sgn}(x)$, is $f(x)$ differentiable at the origin $x=0$?",
    options: ["Yes, $f'(0)=0$", "No, it is discontinuous", "No, LHD is not equal to RHD", "None of these"],
    correctAnswer: "Yes, $f'(0)=0$"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{a+bx}{b-ax}\\right)$, find the derivative $\\frac{dy}{dx}$.",
    options: ["$\\frac{1}{1+x^2}$", "$\\frac{b}{a^2+b^2x^2}$", "$\\frac{a}{a^2+b^2x^2}$", "None of these"],
    correctAnswer: "$\\frac{1}{1+x^2}$"
  },
  {
    question: "Find the derivative of $\\tan^{-1}\\left(\\frac{\\sqrt{1+x^2} + \\sqrt{1-x^2}}{\\sqrt{1+x^2} - \\sqrt{1-x^2}}\\right)$ with respect to $\\cos^{-1}(x^2)$.",
    options: ["$\\frac{1}{2}$", "$-\\frac{1}{2}$", "1", "-1"],
    correctAnswer: "$\\frac{1}{2}$"
  },
  {
    question: "If $f(x) = x^2 \\cos(1/x)$ for $x \\neq 0$ and $f(0) = 0$. Find the derivative value $f'(0)$.",
    options: ["0", "1", "Not defined", "None of these"],
    correctAnswer: "0"
  },
  {
    question: "Let $f(x) = |x-3|$. Is $f(x)$ differentiable at $x=3$?",
    options: ["No, LHD is -1 and RHD is 1", "Yes, $f'(3)=0$", "Yes, LHD=RHD=1", "None of these"],
    correctAnswer: "No, LHD is -1 and RHD is 1"
  },
  {
    question: "The composite function $f(x) = \\sin|x|$ is:",
    options: ["Continuous everywhere but not differentiable at $x=0$", "Continuous and differentiable everywhere", "Discontinuous at $x=0$", "None of these"],
    correctAnswer: "Continuous everywhere but not differentiable at $x=0$"
  },
  {
    question: "If $y = \\tan^{-1}\\left(\\frac{x-a}{1+ax}\\right)$, find the derivative $\\frac{dy}{dx}$.",
    options: ["$\\frac{1}{1+x^2}$", "$-\\frac{1}{1+x^2}$", "$\\frac{1}{1+a^2}$", "None of these"],
    correctAnswer: "$\\frac{1}{1+x^2}$"
  },
  {
    question: "If $y = \\tan^{-1} x$, then which of the following differential equations is satisfied?",
    options: ["$(1+x^2)y_2 + 2x y_1 = 0$", "$(1+x^2)y_2 - 2x y_1 = 0$", "$(1-x^2)y_2 - 2x y_1 = 0$", "None of these"],
    correctAnswer: "$(1+x^2)y_2 + 2x y_1 = 0$"
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

  // Find chapter (Continuity and Differentiability)
  const chapterDoc = await Chapter.findOne({ classId, normalizedChapterName: 'continuity and differentiability' });
  if (!chapterDoc) {
    console.error('Continuity and Differentiability chapter not found for Class 12!');
    process.exit(1);
  }
  const chapterId = chapterDoc._id;

  console.log(`Using classId: ${classId} ("Class 12")`);
  console.log(`Using chapterId: ${chapterId} ("Continuity and Differentiability")`);

  let addedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rawQuestions.length; i++) {
    const qData = rawQuestions[i];

    // Shuffle options to randomize the correct answer position from the start!
    const shuffledOpts = shuffle(qData.options);

    // Verify correct answer is in options
    if (shuffledOpts.indexOf(qData.correctAnswer) === -1) {
      console.error(`Error: Correct answer "${qData.correctAnswer}" not found in options for raw question index ${i}: "${qData.question}"`);
      errorCount++;
      continue;
    }

    const newQuestion = new Question({
      language: 'Both',
      classId: classId,
      chapterId: chapterId,
      question: qData.question,
      options: shuffledOpts,
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
        console.error(`Error saving Continuity/Differentiability question ${i + 1}: ${err.message}`);
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
