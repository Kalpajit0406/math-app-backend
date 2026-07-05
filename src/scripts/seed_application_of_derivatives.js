/**
 * Seeding script to add 130 questions in Application of Derivatives chapter for Class 12.
 * Distribution: 30% easy (39 questions), 30% medium (39 questions), 40% hard (52 questions).
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
  // EASY QUESTIONS (39 questions, 1 to 39)
  // ==========================================
  {
    question: "Find the rate of change of the area of a circle with respect to its radius $r$ when $r = 5\\text{ cm}$.",
    options: ["$10\\pi\\text{ cm}^2/\\text{cm}$", "$5\\pi\\text{ cm}^2/\\text{cm}$", "$25\\pi\\text{ cm}^2/\\text{cm}$", "$2\\pi\\text{ cm}^2/\\text{cm}$"],
    correctAnswer: "$10\\pi\\text{ cm}^2/\\text{cm}$"
  },
  {
    question: "The radius of a circle is increasing uniformly at the rate of $3\\text{ cm/s}$. Find the rate at which the area of the circle is increasing when the radius is $10\\text{ cm}$.",
    options: ["$60\\pi\\text{ cm}^2/\\text{s}$", "$30\\pi\\text{ cm}^2/\\text{s}$", "$10\\pi\\text{ cm}^2/\\text{s}$", "$90\\pi\\text{ cm}^2/\\text{s}$"],
    correctAnswer: "$60\\pi\\text{ cm}^2/\\text{s}$"
  },
  {
    question: "The volume of a cube is increasing at the rate of $8\\text{ cm}^3/\\text{s}$. How fast is the surface area increasing when the length of an edge is $12\\text{ cm}$?",
    options: ["$\\frac{8}{3}\\text{ cm}^2/\\text{s}$", "$4\\text{ cm}^2/\\text{s}$", "$2\\text{ cm}^2/\\text{s}$", "$\\frac{4}{3}\\text{ cm}^2/\\text{s}$"],
    correctAnswer: "$\\frac{8}{3}\\text{ cm}^2/\\text{s}$"
  },
  {
    question: "Find the slope of the tangent to the curve $y = 3x^4 - 4x$ at $x = 4$.",
    options: ["764", "768", "760", "192"],
    correctAnswer: "764"
  },
  {
    question: "Find the slope of the normal to the curve $y = 2x^2 + 3\\sin x$ at $x = 0$.",
    options: ["$-\\frac{1}{3}$", "3", "$\\frac{1}{3}$", "-3"],
    correctAnswer: "$-\\frac{1}{3}$"
  },
  {
    question: "Find the slope of the tangent to the curve $y = \\frac{x-1}{x-2}$ ($x \\neq 2$) at $x = 10$.",
    options: ["$-\\frac{1}{64}$", "$\\frac{1}{64}$", "$-\\frac{1}{8}$", "$\\frac{1}{8}$"],
    correctAnswer: "$-\\frac{1}{64}$"
  },
  {
    question: "The interval in which the function $f(x) = 2x^2 - 3x$ is strictly increasing is:",
    options: ["$(\\frac{3}{4}, \\infty)$", "$(-\\infty, \\frac{3}{4})$", "$(\\frac{4}{3}, \\infty)$", "$(-\\infty, \\frac{4}{3})$"],
    correctAnswer: "$(\\frac{3}{4}, \\infty)$"
  },
  {
    question: "The function $f(x) = \\cos x$ is strictly decreasing in the interval:",
    options: ["$(0, \\pi)$", "$(\\pi, 2\\pi)$", "$(-\\pi, 0)$", "$(-\\pi/2, \\pi/2)$"],
    correctAnswer: "$(0, \\pi)$"
  },
  {
    question: "The function $f(x) = e^{2x}$ is strictly increasing on:",
    options: ["$\\mathbb{R}$", "$(0, \\infty)$", "$(-\\infty, 0)$", "None of these"],
    correctAnswer: "$\\mathbb{R}$"
  },
  {
    question: "The function $f(x) = \\log_e x$ is strictly increasing in:",
    options: ["$(0, \\infty)$", "$(-\\infty, \\infty)$", "$[1, \\infty)$", "None of these"],
    correctAnswer: "$(0, \\infty)$"
  },
  {
    question: "If $f(x) = x^3 - 3x^2 + 4x$, then $f(x)$ is strictly increasing on:",
    options: ["$\\mathbb{R}$", "$(0, \\infty)$", "$(-\\infty, 0)$", "None of these"],
    correctAnswer: "$\\mathbb{R}$"
  },
  {
    question: "Find the points on the curve $y = x^3 - 3x^2 - 9x + 7$ at which the tangent is parallel to the x-axis.",
    options: ["$(3, -20)$ and $(-1, 12)$", "$(3, 20)$ and $(-1, -12)$", "$(1, -4)$ and $(-3, 12)$", "None of these"],
    correctAnswer: "$(3, -20)$ and $(-1, 12)$"
  },
  {
    question: "The line $y = x + 1$ is a tangent to the curve $y^2 = 4x$ at the point:",
    options: ["$(1, 2)$", "$(2, 1)$", "$(1, -2)$", "$(-1, 2)$"],
    correctAnswer: "$(1, 2)$"
  },
  {
    question: "Find the slope of the normal to the curve $x = a\\cos^3\\theta$, $y = a\\sin^3\\theta$ at $\\theta = \\frac{\\pi}{4}$.",
    options: ["-1", "1", "0", "Not defined"],
    correctAnswer: "-1"
  },
  {
    question: "Find the slope of the tangent to the curve $x = 1 - a\\sin\\theta$, $y = b\\cos^2\\theta$ at $\\theta = \\frac{\\pi}{2}$.",
    options: ["0", "$\\frac{2b}{a}$", "$-\\frac{2b}{a}$", "None of these"],
    correctAnswer: "0"
  },
  {
    question: "The slope of the tangent to the curve $y = x^2 - x$ at the point where $x = 2$ is:",
    options: ["3", "2", "1", "4"],
    correctAnswer: "3"
  },
  {
    question: "Find the critical points of the function $f(x) = x^2 - 4x + 3$.",
    options: ["$x = 2$", "$x = 3$", "$x = 1$", "$x = 0$"],
    correctAnswer: "$x = 2$"
  },
  {
    question: "Find the maximum value of $f(x) = -(x-1)^2 + 10$.",
    options: ["10", "9", "11", "None of these"],
    correctAnswer: "10"
  },
  {
    question: "Find the minimum value of $f(x) = |x+2| - 1$.",
    options: ["-1", "0", "1", "None of these"],
    correctAnswer: "-1"
  },
  {
    question: "The function $f(x) = x + \\frac{1}{x}$ ($x > 0$) has a local minimum at:",
    options: ["$x=1$", "$x=-1$", "$x=2$", "None of these"],
    correctAnswer: "$x=1$"
  },
  {
    question: "Find the rate of change of the volume of a sphere with respect to its radius $r$ when $r = 3\\text{ cm}$.",
    options: ["$36\\pi\\text{ cm}^3/\\text{cm}$", "$12\\pi\\text{ cm}^3/\\text{cm}$", "$27\\pi\\text{ cm}^3/\\text{cm}$", "$9\\pi\\text{ cm}^3/\\text{cm}$"],
    correctAnswer: "$36\\pi\\text{ cm}^3/\\text{cm}$"
  },
  {
    question: "The side of an equilateral triangle is increasing at the rate of $2\\text{ cm/s}$. Find the rate of increase of its area when the side is $10\\text{ cm}$.",
    options: ["$10\\sqrt{3}\\text{ cm}^2/\\text{s}$", "$5\\sqrt{3}\\text{ cm}^2/\\text{s}$", "$20\\sqrt{3}\\text{ cm}^2/\\text{s}$", "$10\\text{ cm}^2/\\text{s}$"],
    correctAnswer: "$10\\sqrt{3}\\text{ cm}^2/\\text{s}$"
  },
  {
    question: "Find the slope of the tangent to the curve $y = x^3 - 3x + 2$ at the point whose x-coordinate is $3$.",
    options: ["24", "27", "21", "18"],
    correctAnswer: "24"
  },
  {
    question: "Find the slope of the normal to the curve $y = x^3 - x$ at $x = 2$.",
    options: ["$-\\frac{1}{11}$", "11", "$\\frac{1}{11}$", "-11"],
    correctAnswer: "$-\\frac{1}{11}$"
  },
  {
    question: "For what values of $x$ is the function $f(x) = x^2 - 6x + 8$ strictly decreasing?",
    options: ["$x < 3$", "$x > 3$", "$x < 2$", "$x > 4$"],
    correctAnswer: "$x < 3$"
  },
  {
    question: "The curve $y = x^{1/5}$ has at $(0,0)$:",
    options: ["A vertical tangent", "A horizontal tangent", "No tangent", "An oblique tangent"],
    correctAnswer: "A vertical tangent"
  },
  {
    question: "The equation of the tangent to the curve $y = x^2$ at $(1, 1)$ is:",
    options: ["$2x - y - 1 = 0$", "$2x + y - 3 = 0$", "$x - 2y + 1 = 0$", "$y = x$"],
    correctAnswer: "$2x - y - 1 = 0$"
  },
  {
    question: "The equation of the normal to the curve $y = x^2$ at $(1, 1)$ is:",
    options: ["$x + 2y - 3 = 0$", "$2x - y - 1 = 0$", "$x - 2y + 1 = 0$", "None of these"],
    correctAnswer: "$x + 2y - 3 = 0$"
  },
  {
    question: "Find the slope of the tangent to the curve $y = x^2 - 2x + 1$ at $(1, 0)$.",
    options: ["0", "1", "2", "-1"],
    correctAnswer: "0"
  },
  {
    question: "If the rate of change of area of a square is equal to the rate of change of its perimeter, then the side length $s$ of the square is:",
    options: ["$2\\text{ units}$", "$4\\text{ units}$", "$1\\text{ unit}$", "None of these"],
    correctAnswer: "$2\\text{ units}$"
  },
  {
    question: "The function $f(x) = -2x^3 - 9x^2 - 12x + 1$ is strictly increasing in:",
    options: ["$(-2, -1)$", "$(-\infty, -2)$", "$(-1, \\infty)$", "None of these"],
    correctAnswer: "$(-2, -1)$"
  },
  {
    question: "The maximum value of $\\sin x + \\cos x$ is:",
    options: ["$\\sqrt{2}$", "2", "1", "$\\frac{1}{\\sqrt{2}}$"],
    correctAnswer: "$\\sqrt{2}$"
  },
  {
    question: "The minimum value of $\\sin x + \\cos x$ is:",
    options: ["$-\\sqrt{2}$", "-2", "-1", "$-\\frac{1}{\\sqrt{2}}$"],
    correctAnswer: "$-\\sqrt{2}$"
  },
  {
    question: "Find the critical point of $f(x) = \\sin x$ on $[0, \\pi]$.",
    options: ["$\\frac{\\pi}{2}$", "$\\frac{\\pi}{4}$", "0", "$\\pi$"],
    correctAnswer: "$\\frac{\\pi}{2}$"
  },
  {
    question: "The function $f(x) = x^2$ is strictly decreasing on the interval:",
    options: ["$(-\\infty, 0)$", "$(0, \\infty)$", "$(-1, 1)$", "None of these"],
    correctAnswer: "$(-\\infty, 0)$"
  },
  {
    question: "The function $f(x) = 3 - 4x$ is:",
    options: ["Strictly decreasing on $\\mathbb{R}$", "Strictly increasing on $\\mathbb{R}$", "Neither increasing nor decreasing", "None of these"],
    correctAnswer: "Strictly decreasing on $\\mathbb{R}$"
  },
  {
    question: "Find the slope of the normal to the curve $y = x^2 + 2x$ at the point $(0,0)$.",
    options: ["$-\\frac{1}{2}$", "2", "$\\frac{1}{2}$", "-2"],
    correctAnswer: "$-\\frac{1}{2}$"
  },
  {
    question: "The radius of a balloon is increasing at the rate of $10\\text{ cm/s}$. Find the rate of increase of its surface area when the radius is $15\\text{ cm}$.",
    options: ["$1200\\pi\\text{ cm}^2/\\text{s}$", "$600\\pi\\text{ cm}^2/\\text{s}$", "$300\\pi\\text{ cm}^2/\\text{s}$", "$2400\\pi\\text{ cm}^2/\\text{s}$"],
    correctAnswer: "$1200\\pi\\text{ cm}^2/\\text{s}$"
  },
  {
    question: "The displacement $s$ of a particle at time $t$ is given by $s = 2t^3 - 5t^2 + 4t - 3$. The velocity of the particle when acceleration is zero is:",
    options: ["$-\\frac{1}{6}$", "$\\frac{5}{6}$", "$-\\frac{5}{6}$", "$\\frac{1}{6}$"],
    correctAnswer: "$-\\frac{1}{6}$"
  },

  // ==========================================
  // MEDIUM QUESTIONS (39 questions, 40 to 78)
  // ==========================================
  {
    question: "A balloon, which always remains spherical, is being inflated by pumping in $900\\text{ cm}^3/\\text{s}$ of gas. Find the rate at which the radius of the balloon increases when the radius is $15\\text{ cm}$.",
    options: ["$\\frac{1}{\\pi}\\text{ cm/s}$", "$\\frac{2}{\\pi}\\text{ cm/s}$", "$\\frac{1}{2\\pi}\\text{ cm/s}$", "$15\\text{ cm/s}$"],
    correctAnswer: "$\\frac{1}{\\pi}\\text{ cm/s}$"
  },
  {
    question: "A stone is dropped into a quiet lake and waves move in circles at a speed of $4\\text{ cm/s}$. At the instant when the radius of the circular wave is $10\\text{ cm}$, how fast is the enclosed area increasing?",
    options: ["$80\\pi\\text{ cm}^2/\\text{s}$", "$40\\pi\\text{ cm}^2/\\text{s}$", "$20\\pi\\text{ cm}^2/\\text{s}$", "$160\\pi\\text{ cm}^2/\\text{s}$"],
    correctAnswer: "$80\\pi\\text{ cm}^2/\\text{s}$"
  },
  {
    question: "A ladder $5\\text{ m}$ long is leaning against a wall. The bottom of the ladder is pulled along the ground, away from the wall, at the rate of $2\\text{ cm/s}$. How fast is its height on the wall decreasing when the foot of the ladder is $4\\text{ m}$ away from the wall?",
    options: ["$\\frac{8}{3}\\text{ cm/s}$", "$\\frac{3}{8}\\text{ cm/s}$", "$\\frac{4}{3}\\text{ cm/s}$", "$2\\text{ cm/s}$"],
    correctAnswer: "$\\frac{8}{3}\\text{ cm/s}$"
  },
  {
    question: "Find the interval in which the function $f(x) = x^2 - 4x + 6$ is strictly decreasing.",
    options: ["$(-\infty, 2)$", "$(2, \\infty)$", "$(-\infty, 4)$", "$(4, \\infty)$"],
    correctAnswer: "$(-\infty, 2)$"
  },
  {
    question: "Find the interval in which the function $f(x) = (x+1)^3(x-3)^3$ is strictly increasing.",
    options: ["$(1, \\infty)$", "$(-\infty, 1)$", "$(-1, 3)$", "None of these"],
    correctAnswer: "$(1, \\infty)$"
  },
  {
    question: "Find the interval in which the function $f(x) = \\sin(3x)$ for $x \\in [0, \\pi/2]$ is strictly decreasing.",
    options: ["$(\\frac{3}{\\pi}, \\frac{\\pi}{2})$", "$(0, \\frac{\\pi}{6})$", "$(\\frac{\\pi}{6}, \\frac{\\pi}{2})$", "None of these"],
    correctAnswer: "$(\\frac{\\pi}{6}, \\frac{\\pi}{2})$"
  },
  {
    question: "Find the equations of all lines having slope 0 which are tangent to the curve $y = \\frac{1}{x^2 - 2x + 3}$.",
    options: ["$y = \\frac{1}{2}$", "$y = \\frac{1}{3}$", "$y = 1$", "$y = 2$"],
    correctAnswer: "$y = \\frac{1}{2}$"
  },
  {
    question: "Find the equation of the tangent to the curve $y = \\sqrt{3x - 2}$ which is parallel to the line $4x - 2y + 5 = 0$.",
    options: ["$48x - 24y = 23$", "$48x - 24y = -23$", "$24x - 48y = 23$", "None of these"],
    correctAnswer: "$48x - 24y = 23$"
  },
  {
    question: "Find the point on the curve $y = x^3 - 11x + 5$ at which the tangent is $y = x - 11$.",
    options: ["$(2, -9)$", "$(-2, 19)$", "$(3, -1)$", "$(-3, 11)$"],
    correctAnswer: "$(2, -9)$"
  },
  {
    question: "Find the equations of the normal to the curve $y = x^3 + 2x + 6$ which is parallel to the line $x + 14y + 4 = 0$.",
    options: ["$x + 14y - 254 = 0$ and $x + 14y + 86 = 0$", "$x + 14y + 254 = 0$", "$x + 14y - 86 = 0$", "None of these"],
    correctAnswer: "$x + 14y - 254 = 0$ and $x + 14y + 86 = 0$"
  },
  {
    question: "If $x = a(\\cos\\theta + \\theta\\sin\\theta)$ and $y = a(\\sin\\theta - \\theta\\cos\\theta)$, find the distance of the normal to this curve from the origin.",
    options: ["$a$", "$a\\theta$", "$2a$", "None of these"],
    correctAnswer: "$a$"
  },
  {
    question: "Find the local maximum value of the function $f(x) = 3x^4 + 4x^3 - 12x^2 + 12$.",
    options: ["12", "7", "-20", "None of these"],
    correctAnswer: "12"
  },
  {
    question: "Find the local minimum values of the function $f(x) = 3x^4 + 4x^3 - 12x^2 + 12$.",
    options: ["7 and -20", "12 and 7", "12 and -20", "None of these"],
    correctAnswer: "7 and -20"
  },
  {
    question: "Find the derivative of the function $f(x) = x^3 - 3x^2 + 3x - 100$.",
    options: ["$3(x-1)^2$", "$3(x+1)^2$", "$3x^2 - 6x$", "None of these"],
    correctAnswer: "$3(x-1)^2$"
  },
  {
    question: "Find the absolute maximum value of $f(x) = 2x^3 - 15x^2 + 36x + 1$ on the interval $[1, 5]$.",
    options: ["56", "24", "29", "30"],
    correctAnswer: "56"
  },
  {
    question: "Find the absolute minimum value of $f(x) = 2x^3 - 15x^2 + 36x + 1$ on the interval $[1, 5]$.",
    options: ["24", "29", "28", "1"],
    correctAnswer: "24"
  },
  {
    question: "Find the absolute maximum and minimum values of $f(x) = \\sin x + \\cos x$ on $[0, \\pi]$.",
    options: ["Max $\\sqrt{2}$, Min -1", "Max $\\sqrt{2}$, Min 1", "Max 2, Min -2", "None of these"],
    correctAnswer: "Max $\\sqrt{2}$, Min -1"
  },
  {
    question: "Find the positive numbers whose sum is 15 and the sum of whose squares is minimum.",
    options: ["$7.5, 7.5$", "$8, 7$", "$9, 6$", "$10, 5$"],
    correctAnswer: "$7.5, 7.5$"
  },
  {
    question: "Find two positive numbers $x$ and $y$ such that their sum is 35 and the product $x^2 y^5$ is maximum.",
    options: ["$x = 10, y = 25$", "$x = 20, y = 15$", "$x = 15, y = 20$", "None of these"],
    correctAnswer: "$x = 10, y = 25$"
  },
  {
    question: "Find the shortest distance of the point $(0, c)$ from the parabola $y = x^2$ for $0 \\le c \\le 5$.",
    options: ["$\\sqrt{c - 1/4}$ for $c \\ge 1/2$ and $c$ for $c < 1/2$", "$\\sqrt{c - 1/4}$ for all $c$", "$c$ for all $c$", "None of these"],
    correctAnswer: "$\\sqrt{c - 1/4}$ for $c \\ge 1/2$ and $c$ for $c < 1/2$"
  },
  {
    question: "Find the intervals in which the function $f(x) = \\frac{4\\sin x - 2x - x\\cos x}{2+\\cos x}$ is strictly increasing in $[0, 2\\pi]$.",
    options: ["$(0, \\pi/2) \\cup (3\\pi/2, 2\\pi)$", "$(\\pi/2, 3\\pi/2)$", "$(0, \\pi)$", "None of these"],
    correctAnswer: "$(0, \\pi/2) \\cup (3\\pi/2, 2\\pi)$"
  },
  {
    question: "Find the equation of the normal to the curve $x^2 = 4y$ which passes through the point $(1, 2)$.",
    options: ["$x + y = 3$", "$x - y = -1$", "$2x + y = 4$", "None of these"],
    correctAnswer: "$x + y = 3$"
  },
  {
    question: "Find the points on the curve $9y^2 = x^3$ where the normal to the curve makes equal intercepts with the axes.",
    options: ["$(4, \\pm 8/3)$", "$(4, 8/3)$", "$(-4, 8/3)$", "None of these"],
    correctAnswer: "$(4, \\pm 8/3)$"
  },
  {
    question: "A point on the hypotenuse of a right triangle is at distance $a$ and $b$ from the sides. What is the minimum length of the hypotenuse?",
    options: ["$(a^{2/3} + b^{2/3})^{3/2}$", "$(a + b)^{3/2}$", "$a^{2/3} + b^{2/3}$", "None of these"],
    correctAnswer: "$(a^{2/3} + b^{2/3})^{3/2}$"
  },
  {
    question: "The rate of change of the volume of a cone of constant height $h$ with respect to its base radius $r$ is:",
    options: ["$\\frac{2}{3}\\pi r h$", "$\\frac{1}{3}\\pi r h$", "$\\pi r^2$", "None of these"],
    correctAnswer: "$\\frac{2}{3}\\pi r h$"
  },
  {
    question: "Find the slope of the normal to the curve $y = 2\\sin^2(3x)$ at $x = \\frac{\\pi}{12}$.",
    options: ["$-\\frac{1}{6}$", "$6$", "$-\\frac{1}{12}$", "None of these"],
    correctAnswer: "$-\\frac{1}{6}$"
  },
  {
    question: "A cylindrical tank of radius $10\\text{ m}$ is being filled with wheat at the rate of $314\\text{ m}^3\\text{/h}$. Find the rate at which the depth of wheat increases (take $\\pi \\approx 3.14$).",
    options: ["$1\\text{ m/h}$", "$0.1\\text{ m/h}$", "$10\\text{ m/h}$", "$0.5\\text{ m/h}$"],
    correctAnswer: "$1\\text{ m/h}$"
  },
  {
    question: "The function $f(x) = \\tan x - x$ is classified as:",
    options: ["Always increasing", "Always decreasing", "Increasing for $x > 0$ and decreasing for $x < 0$", "None of these"],
    correctAnswer: "Always increasing"
  },
  {
    question: "Find the interval in which the function $f(x) = x^3 - 3x$ is increasing.",
    options: ["$(-\\infty, -1] \\cup [1, \\infty)$", "$[-1, 1]$", "$(-\\infty, 1]$", "None of these"],
    correctAnswer: "$(-\\infty, -1] \\cup [1, \\infty)$"
  },
  {
    question: "Find the values of $x$ for which the tangent to the curve $y = x^3 - 3x^2 - 9x + 7$ is parallel to the x-axis.",
    options: ["$3, -1$", "$3, 1$", "$-3, 1$", "$-3, -1$"],
    correctAnswer: "$3, -1$"
  },
  {
    question: "The tangent to the curve $y = e^{2x}$ at the point $(0, 1)$ meets the x-axis at the point:",
    options: ["$(-\\frac{1}{2}, 0)$", "$(0, -\\frac{1}{2})$", "$(\\frac{1}{2}, 0)$", "None of these"],
    correctAnswer: "$(-\\frac{1}{2}, 0)$"
  },
  {
    question: "The normal to the curve $y(x-2)(x-3) = x+6$ at the point where the curve cuts the y-axis, passes through the point:",
    options: ["$(1/2, 1/2)$", "$(1, 1)$", "$(0, 0)$", "$(1/2, -1/2)$"],
    correctAnswer: "$(1/2, 1/2)$"
  },
  {
    question: "The coordinates of the point on the curve $y = x^2 - 3x + 2$ where the tangent is perpendicular to the line $y = x$ are:",
    options: ["$(1, 0)$", "$(2, 0)$", "$(0, 2)$", "None of these"],
    correctAnswer: "$(1, 0)$"
  },
  {
    question: "If $f(x) = \\frac{x}{\\sin x}$ for $x \\in (0, \\pi/2)$, then which of the following is true?",
    options: ["$f(x)$ is strictly increasing", "$f(x)$ is strictly decreasing", "$f(x)$ is constant", "None of these"],
    correctAnswer: "$f(x)$ is strictly increasing"
  },
  {
    question: "Find the slope of the tangent to the curve $y = 2x^3 - 15x^2 + 36x - 10$ at $x = 3$.",
    options: ["0", "9", "-9", "18"],
    correctAnswer: "0"
  },
  {
    question: "Find the equations of the tangents to the curve $y = \\cos(x+y)$ for $-\\pi \\le x \\le \\pi$ that are parallel to $x+2y = 0$.",
    options: ["$x + 2y = \\frac{\\pi}{2}$ and $x + 2y = -\\frac{3\\pi}{2}$", "$x + 2y = \\pi$", "$x + 2y = -\\pi$", "None of these"],
    correctAnswer: "$x + 2y = \\frac{\\pi}{2}$ and $x + 2y = -\\frac{3\\pi}{2}$"
  },
  {
    question: "Find the angle of intersection of the curves $y = x^2$ and $6y = 7 - x^3$ at the point $(1, 1)$.",
    options: ["$\\frac{\\pi}{2}$", "$\\frac{\\pi}{4}$", "$\\frac{\\pi}{3}$", "None of these"],
    correctAnswer: "$\\frac{\\pi}{2}$"
  },
  {
    question: "A water tank has the shape of an inverted right circular cone with its axis vertical and vertex lowermost. Its semi-vertical angle is $\\tan^{-1}(0.5)$. Water is poured into it at a constant rate of $5\\text{ m}^3/\\text{h}$. Find the rate at which the level of the water is rising at the instant when the depth of water in the tank is $4\\text{ m}$.",
    options: ["$\\frac{5}{4\\pi}\\text{ m/h}$", "$\\frac{5}{\\pi}\\text{ m/h}$", "$\\frac{1}{4\\pi}\\text{ m/h}$", "None of these"],
    correctAnswer: "$\\frac{5}{4\\pi}\\text{ m/h}$"
  },
  {
    question: "The rate of change of the area of a circle with respect to its circumference $C$ is:",
    options: ["$\\frac{C}{2\\pi}$", "$\\frac{C}{\\pi}$", "$2\\pi C$", "None of these"],
    correctAnswer: "$\\frac{C}{2\\pi}$"
  },

  // ==========================================
  // HARD QUESTIONS (52 questions, 79 to 130)
  // ==========================================
  {
    question: "Find the maximum area of an isosceles triangle inscribed in the ellipse $\\frac{x^2}{a^2} + \\frac{y^2}{b^2} = 1$ with its vertex at one end of the major axis.",
    options: ["$\\frac{3\\sqrt{3}}{4} ab$", "$\\frac{3\\sqrt{3}}{2} ab$", "$\\frac{\\sqrt{3}}{4} ab$", "None of these"],
    correctAnswer: "$\\frac{3\\sqrt{3}}{4} ab$"
  },
  {
    question: "An open box with a square base is to be made out of a given quantity of cardboard of area $C^2$. Show that the maximum volume of the box is:",
    options: ["$\\frac{C^3}{6\\sqrt{3}}$", "$\\frac{C^3}{3\\sqrt{3}}$", "$\\frac{C^3}{2\\sqrt{3}}$", "None of these"],
    correctAnswer: "$\\frac{C^3}{6\\sqrt{3}}$"
  },
  {
    question: "Find the volume of the largest cylinder that can be inscribed in a sphere of radius $R$.",
    options: ["$\\frac{4\\pi R^3}{3\\sqrt{3}}$", "$\\frac{4\\pi R^3}{9\\sqrt{3}}$", "$\\frac{2\\pi R^3}{3\\sqrt{3}}$", "None of these"],
    correctAnswer: "$\\frac{4\\pi R^3}{3\\sqrt{3}}$"
  },
  {
    question: "Show that the height of the cylinder of maximum volume that can be inscribed in a sphere of radius $R$ is:",
    options: ["$\\frac{2R}{\\sqrt{3}}$", "$\\frac{R}{\\sqrt{3}}$", "$\\sqrt{2}R$", "None of these"],
    correctAnswer: "$\\frac{2R}{\\sqrt{3}}$"
  },
  {
    question: "The semi-vertical angle of a cone of maximum volume and of given slant height is:",
    options: ["$\\tan^{-1}\\sqrt{2}$", "$\\sin^{-1}(1/3)$", "$\\cos^{-1}(1/3)$", "None of these"],
    correctAnswer: "$\\tan^{-1}\\sqrt{2}$"
  },
  {
    question: "Show that the semi-vertical angle of the right circular cone of given surface area and maximum volume is:",
    options: ["$\\sin^{-1}(1/3)$", "$\\sin^{-1}(1/\\sqrt{3})$", "$\\cos^{-1}(1/3)$", "None of these"],
    correctAnswer: "$\\sin^{-1}(1/3)$"
  },
  {
    question: "The coordinates of the point on the curve $y^2 = 4x$ which is closest to the point $(2, 1)$ are:",
    options: ["$(1, 2)$", "$(1, -2)$", "$(1/4, 1)$", "None of these"],
    correctAnswer: "$(1, 2)$"
  },
  {
    question: "Find the equation of the normal to the curve $y = x^3 + 2x + 6$ which is perpendicular to the line $x - 14y + 3 = 0$.",
    options: ["No such normal exists", "$14x + y = 0$", "$14x + y + 254 = 0$", "None of these"],
    correctAnswer: "No such normal exists"
  },
  {
    question: "If the subnormal to the curve $x y^n = a^{n+1}$ is constant at all points, then $n$ is equal to:",
    options: ["$-2$", "$-1/2$", "$2$", "$1/2$"],
    correctAnswer: "$-2$"
  },
  {
    question: "The tangent to the curve $y = x^3 - 3x^2 + 2x$ at $(x_1, y_1)$ meets the curve again at $(x_2, y_2)$. The relation between $x_1$ and $x_2$ is:",
    options: ["$x_2 = -2x_1 + 3$", "$x_2 = -2x_1$", "$x_2 = 2x_1$", "None of these"],
    correctAnswer: "$x_2 = -2x_1 + 3$"
  },
  {
    question: "The angle of intersection of the curves $y^2 = x$ and $x^2 = y$ at $(1, 1)$ is:",
    options: ["$\\tan^{-1}(3/4)$", "$\\pi/2$", "$\\tan^{-1}(4/3)$", "None of these"],
    correctAnswer: "$\\tan^{-1}(3/4)$"
  },
  {
    question: "The curves $y = a^x$ and $y = b^x$ intersect at an angle:",
    options: ["$\\tan^{-1}\\left|\\frac{\\ln a - \\ln b}{1 + \\ln a \\ln b}\\right|$", "$\\pi/2$", "0", "None of these"],
    correctAnswer: "$\\tan^{-1}\\left|\\frac{\\ln a - \\ln b}{1 + \\ln a \\ln b}\\right|$"
  },
  {
    question: "Show that the curves $x = y^2$ and $x y = k$ cut at right angles if $8k^2$ is equal to:",
    options: ["1", "2", "4", "8"],
    correctAnswer: "1"
  },
  {
    question: "Let $f(x) = \\tan^{-1}(\\sin x + \\cos x)$ for $x > 0$. The function $f(x)$ is strictly increasing in:",
    options: ["$(0, \\pi/4)$", "$(\\pi/4, \\pi/2)$", "$(0, \\pi/2)$", "None of these"],
    correctAnswer: "$(0, \\pi/4)$"
  },
  {
    question: "Find the minimum value of $f(x) = x^x$ for $x > 0$.",
    options: ["$e^{-1/e}$", "$e^{1/e}$", "$e^{-e}$", "None of these"],
    correctAnswer: "$e^{-1/e}$"
  },
  {
    question: "A wire of length $28\\text{ m}$ is cut into two pieces. One of the pieces is bent to form a square, and the other is bent to form a circle. What are the lengths of the two pieces so that the combined area of the square and the circle is minimum?",
    options: ["$\\frac{112}{\\pi+4}\\text{ m}$ and $\\frac{28\\pi}{\\pi+4}\\text{ m}$", "$\\frac{56}{\\pi+4}\\text{ m}$ and $\\frac{56\\pi}{\\pi+4}\\text{ m}$", "$\\frac{28}{\\pi+4}\\text{ m}$ and $\\frac{28\\pi}{\\pi+4}\\text{ m}$", "None of these"],
    correctAnswer: "$\\frac{112}{\\pi+4}\\text{ m}$ and $\\frac{28\\pi}{\\pi+4}\\text{ m}$"
  },
  {
    question: "What is the ratio of the volume of the largest cone that can be inscribed in a sphere of radius $R$ to the volume of the sphere?",
    options: ["$\\frac{8}{27}$", "$\\frac{4}{9}$", "$\\frac{1}{3}$", "$\\frac{2}{3}$"],
    correctAnswer: "$\\frac{8}{27}$"
  },
  {
    question: "Find the dimensions of the rectangle of perimeter $36\\text{ cm}$ which will sweep out a volume as large as possible when revolved about one of its sides.",
    options: ["$12\\text{ cm} \\times 6\\text{ cm}$", "$9\\text{ cm} \\times 9\\text{ cm}$", "$10\\text{ cm} \\times 8\\text{ cm}$", "None of these"],
    correctAnswer: "$12\\text{ cm} \\times 6\\text{ cm}$"
  },
  {
    question: "The rate of change of the area of a sector of a circle of constant radius $R$ with respect to its central angle $\\theta$ (in radians) is:",
    options: ["$\\frac{1}{2} R^2$", "$R^2$", "$\\pi R^2$", "None of these"],
    correctAnswer: "$\\frac{1}{2} R^2$"
  },
  {
    question: "The point on the curve $y^2 = x^2 - x + 1$ at which the tangent is parallel to the x-axis is:",
    options: ["$(1/2, \\pm\\sqrt{3}/2)$", "$(1/2, 3/4)$", "$(1, 1)$", "None of these"],
    correctAnswer: "$(1/2, \\pm\\sqrt{3}/2)$"
  },
  {
    question: "The tangent to the curve $y = x^3$ at the point $P(t, t^3)$ meets the curve again at $Q$. Find the x-coordinate of $Q$.",
    options: ["$-2t$", "$2t$", "$-t$", "$3t$"],
    correctAnswer: "$-2t$"
  },
  {
    question: "Find the equation of the normal to the curve $y = \\sin x$ at the origin $(0,0)$.",
    options: ["$x + y = 0$", "$x - y = 0$", "$y = x$", "None of these"],
    correctAnswer: "$x + y = 0$"
  },
  {
    question: "The minimum value of $f(x) = a^2 \\sec^2 x + b^2 \\csc^2 x$ is:",
    options: ["$(a+b)^2$", "$(a-b)^2$", "$a^2+b^2$", "None of these"],
    correctAnswer: "$(a+b)^2$"
  },
  {
    question: "The maximum value of $f(x) = \\frac{\\log_e x}{x}$ for $x > 0$ is:",
    options: ["$\\frac{1}{e}$", "$e$", "$\\frac{1}{e^2}$", "None of these"],
    correctAnswer: "$\\frac{1}{e}$"
  },
  {
    question: "Find the slope of the tangent to the curve $y = \\int_0^x \\frac{dt}{1+t^3}$ at $x = 1$.",
    options: ["$\\frac{1}{2}$", "1", "0", "None of these"],
    correctAnswer: "$\\frac{1}{2}$"
  },
  {
    question: "If $y = x^2 - 4x$, and $dx/dt = 3$, find the rate of change of $y$ with respect to time $t$ when $x = 5$.",
    options: ["$18$", "$6$", "$12$", "None of these"],
    correctAnswer: "$18$"
  },
  {
    question: "Find the point on the curve $y^2 = 8x$ for which the abscissa and ordinate increase at the same rate.",
    options: ["$(2, 4)$", "$(2, -4)$", "$(1, 2\\sqrt{2})$", "None of these"],
    correctAnswer: "$(2, 4)$"
  },
  {
    question: "Find the point on the curve $y = x^3 - 3x^2 - 9x + 7$ where the slope of the tangent is minimum.",
    options: ["$(1, -4)$", "$(0, 7)$", "$(3, -20)$", "None of these"],
    correctAnswer: "$(1, -4)$"
  },
  {
    question: "The maximum slope of the curve $y = -x^3 + 3x^2 + 9x - 27$ is:",
    options: ["12", "9", "6", "None of these"],
    correctAnswer: "12"
  },
  {
    question: "The line $y = mx + 1$ is a tangent to the curve $y^2 = 4x$ if the value of $m$ is:",
    options: ["1", "2", "1/2", "3"],
    correctAnswer: "1"
  },
  {
    question: "If the tangent to the curve $xy + ax + by = 0$ at $(1, 1)$ is inclined at an angle of $\\tan^{-1}(2)$ to the x-axis, find the values of $a$ and $b$.",
    options: ["$a = 1, b = -2$", "$a = -1, b = 2$", "$a = -2, b = 1$", "None of these"],
    correctAnswer: "$a = 1, b = -2$"
  },
  {
    question: "Find the equation of the normal to the curve $y = \\log_e x$ at $x = 1$.",
    options: ["$x + y = 1$", "$x - y = 1$", "$x + y = 0$", "None of these"],
    correctAnswer: "$x + y = 1$"
  },
  {
    question: "Find the local maximum value of $f(x) = x \\sqrt{1-x}$ for $0 < x < 1$.",
    options: ["$\\frac{2}{3\\sqrt{3}}$", "$\\frac{1}{3\\sqrt{3}}$", "$\\frac{2}{\\sqrt{3}}$", "None of these"],
    correctAnswer: "$\\frac{2}{3\\sqrt{3}}$"
  },
  {
    question: "Show that the function $f(x) = \\frac{\\log_e x}{x}$ is strictly increasing in the interval:",
    options: ["$(0, e)$", "$(e, \\infty)$", "$(0, 1)$", "None of these"],
    correctAnswer: "$(0, e)$"
  },
  {
    question: "Find the absolute maximum value of $f(x) = x + \\sin(2x)$ on $[0, 2\\pi]$.",
    options: ["$2\\pi$", "$\\pi$", "$\\frac{3\\pi}{2}$", "None of these"],
    correctAnswer: "$2\\pi$"
  },
  {
    question: "Find the absolute minimum value of $f(x) = x + \\sin(2x)$ on $[0, 2\\pi]$.",
    options: ["0", "$\\pi$", "$-\\pi$", "None of these"],
    correctAnswer: "0"
  },
  {
    question: "A balloon, which always remains spherical, has a variable diameter $\\frac{3}{2}(2x+1)$. Find the rate of change of its volume with respect to $x$.",
    options: ["$\\frac{27}{8}\\pi (2x+1)^2$", "$\\frac{9}{8}\\pi (2x+1)^2$", "$\\frac{27}{4}\\pi (2x+1)^2$", "None of these"],
    correctAnswer: "$\\frac{27}{8}\\pi (2x+1)^2$"
  },
  {
    question: "The total cost $C(x)$ in Rupees associated with the production of $x$ units of an item is given by $C(x) = 0.007x^3 - 0.003x^2 + 15x + 4000$. Find the marginal cost when $17$ units are produced.",
    options: ["$20.967$", "$15.000$", "$30.125$", "None of these"],
    correctAnswer: "$20.967$"
  },
  {
    question: "The total revenue in Rupees received from the sale of $x$ units of a product is given by $R(x) = 13x^2 + 26x + 15$. Find the marginal revenue when $x = 7$.",
    options: ["$208$", "$130$", "$26$", "None of these"],
    correctAnswer: "$208$"
  },
  {
    question: "An edge of a variable cube is increasing at the rate of $3\\text{ cm/s}$. How fast is the volume of the cube increasing when the edge is $10\\text{ cm}$ long?",
    options: ["$900\\text{ cm}^3/\\text{s}$", "$300\\text{ cm}^3/\\text{s}$", "$100\\text{ cm}^3/\\text{s}$", "$90\\text{ cm}^3/\\text{s}$"],
    correctAnswer: "$900\\text{ cm}^3/\\text{s}$"
  },
  {
    question: "A particle moves along the curve $6y = x^3 + 2$. Find the points on the curve at which the y-coordinate is changing $8$ times as fast as the x-coordinate.",
    options: ["$(4, 11)$ and $(-4, -31/3)$", "$(4, 11)$", "$(-4, -31/3)$", "None of these"],
    correctAnswer: "$(4, 11)$ and $(-4, -31/3)$"
  },
  {
    question: "Sand is pouring from a pipe at the rate of $12\\text{ cm}^3/\\text{s}$. The falling sand forms a cone on the ground in such a way that the height of the cone is always one-sixth of the radius of the base. How fast is the height of the sand cone increasing when the height is $4\\text{ cm}$?",
    options: ["$\\frac{1}{48\\pi}\\text{ cm/s}$", "$\\frac{1}{12\\pi}\\text{ cm/s}$", "$\\frac{1}{36\\pi}\\text{ cm/s}$", "None of these"],
    correctAnswer: "$\\frac{1}{48\\pi}\\text{ cm/s}$"
  },
  {
    question: "The total revenue in Rupees received from the sale of $x$ units of a product is given by $R(x) = 3x^2 + 36x + 5$. The marginal revenue when $x = 15$ is:",
    options: ["$126$", "$116$", "$96$", "$90$"],
    correctAnswer: "$126$"
  },
  {
    question: "Find the interval in which the function $f(x) = \\sin x + \\cos x$ for $x \\in [0, 2\\pi]$ is strictly increasing.",
    options: ["$(0, \\pi/4) \\cup (5\\pi/4, 2\\pi)$", "$(\\pi/4, 5\\pi/4)$", "$(0, 5\\pi/4)$", "None of these"],
    correctAnswer: "$(0, \\pi/4) \\cup (5\\pi/4, 2\\pi)$"
  },
  {
    question: "The function $f(x) = \\log_e(1+x) - \\frac{2x}{2+x}$ is strictly increasing for:",
    options: ["$x > 0$", "$x < 0$", "$x > -1$", "None of these"],
    correctAnswer: "$x > 0$"
  },
  {
    question: "The function $f(x) = x(x-2)^2$ is strictly increasing in:",
    options: ["$(-\\infty, 2/3) \\cup (2, \\infty)$", "$(2/3, 2)$", "$(0, 2)$", "None of these"],
    correctAnswer: "$(-\\infty, 2/3) \\cup (2, \\infty)$"
  },
  {
    question: "The slope of the tangent to the curve $y = e^x \\sin x$ at $x = 0$ is:",
    options: ["1", "0", "-1", "2"],
    correctAnswer: "1"
  },
  {
    question: "The line $y = x + 1$ is tangent to the curve $y^2 = 4x$. What is the point of contact?",
    options: ["$(1, 2)$", "$(-1, 2)$", "$(1, -2)$", "None of these"],
    correctAnswer: "$(1, 2)$"
  },
  {
    question: "Show that the normal to the curve $y^2 = 8x$ at $(2, 4)$ is given by the equation:",
    options: ["$x + y = 6$", "$x - y = -2$", "$x + y = 2$", "None of these"],
    correctAnswer: "$x + y = 6$"
  },
  {
    question: "If the function $f(x) = x^3 - ax$ is strictly increasing on $\\mathbb{R}$, then the range of $a$ is:",
    options: ["$a \\le 0$", "$a < 0$", "$a \\ge 0$", "None of these"],
    correctAnswer: "$a \\le 0$"
  },
  {
    question: "The minimum value of $f(x) = 2x^3 - 6x^2 + 6x + 5$ on the interval $[0, 3]$ is:",
    options: ["5", "11", "23", "None of these"],
    correctAnswer: "5"
  },
  {
    question: "The maximum value of $f(x) = 2x^3 - 6x^2 + 6x + 5$ on the interval $[0, 3]$ is:",
    options: ["23", "11", "5", "None of these"],
    correctAnswer: "23"
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

  // Find chapter (Application of Derivatives)
  const chapterDoc = await Chapter.findOne({ classId, normalizedChapterName: 'application of derivatives' });
  if (!chapterDoc) {
    console.error('Application of Derivatives chapter not found for Class 12!');
    process.exit(1);
  }
  const chapterId = chapterDoc._id;

  console.log(`Using classId: ${classId} ("Class 12")`);
  console.log(`Using chapterId: ${chapterId} ("Application of Derivatives")`);

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
        console.error(`Error saving Application of Derivatives question ${i + 1}: ${err.message}`);
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
