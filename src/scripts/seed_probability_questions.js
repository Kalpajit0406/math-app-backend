/**
 * Script to seed 100 unique probability questions for Class 11.
 * Matches requirements: 30% easy, 30% medium, 40% hard questions.
 * Handles DB constraints, auto-generates questionHash and contentHash.
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');
const Class = require('../models/classModel');
const Chapter = require('../models/chapterModel');

const questionsData = [
  // ==========================================
  // EASY QUESTIONS (30 questions, 1 to 30)
  // ==========================================
  {
    question: "A coin is tossed twice. What is the probability of getting at least one head?",
    options: ["$\\frac{1}{4}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$", "1"],
    correctAnswer: "$\\frac{3}{4}$"
  },
  {
    question: "A coin is tossed three times. What is the probability of getting exactly two tails?",
    options: ["$\\frac{1}{8}$", "$\\frac{3}{8}$", "$\\frac{1}{2}$", "$\\frac{5}{8}$"],
    correctAnswer: "$\\frac{3}{8}$"
  },
  {
    question: "A single die is thrown. What is the probability of getting an even prime number?",
    options: ["$\\frac{1}{6}$", "$\\frac{1}{3}$", "$\\frac{1}{2}$", "$\\frac{2}{3}$"],
    correctAnswer: "$\\frac{1}{6}$"
  },
  {
    question: "A single die is thrown. What is the probability of getting a number greater than 4?",
    options: ["$\\frac{1}{6}$", "$\\frac{1}{3}$", "$\\frac{1}{2}$", "$\\frac{2}{3}$"],
    correctAnswer: "$\\frac{1}{3}$"
  },
  {
    question: "Two coins are tossed simultaneously. What is the probability of getting at most one head?",
    options: ["$\\frac{1}{4}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$", "1"],
    correctAnswer: "$\\frac{3}{4}$"
  },
  {
    question: "A card is drawn from a well-shuffled pack of 52 cards. What is the probability that it is a king?",
    options: ["$\\frac{1}{13}$", "$\\frac{2}{13}$", "$\\frac{4}{13}$", "$\\frac{1}{52}$"],
    correctAnswer: "$\\frac{1}{13}$"
  },
  {
    question: "A card is drawn from a well-shuffled pack of 52 cards. What is the probability that it is a red card?",
    options: ["$\\frac{1}{4}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$", "$\\frac{1}{13}$"],
    correctAnswer: "$\\frac{1}{2}$"
  },
  {
    question: "If $P(A) = 0.4$, what is the probability of the complement event $A'$?",
    options: ["0.4", "0.6", "0.5", "1"],
    correctAnswer: "0.6"
  },
  {
    question: "Two events $A$ and $B$ are mutually exclusive. If $P(A) = 0.3$ and $P(B) = 0.4$, find $P(A \\cup B)$.",
    options: ["0.1", "0.7", "0.12", "0.5"],
    correctAnswer: "0.7"
  },
  {
    question: "An ordinary die is rolled once. What is the probability of getting a multiple of 3?",
    options: ["$\\frac{1}{6}$", "$\\frac{1}{3}$", "$\\frac{1}{2}$", "$\\frac{2}{3}$"],
    correctAnswer: "$\\frac{1}{3}$"
  },
  {
    question: "A card is drawn from a well-shuffled pack of 52 cards. What is the probability of getting a face card?",
    options: ["$\\frac{3}{13}$", "$\\frac{4}{13}$", "$\\frac{1}{13}$", "$\\frac{6}{13}$"],
    correctAnswer: "$\\frac{3}{13}$"
  },
  {
    question: "What is the probability of a sure event?",
    options: ["0", "0.5", "1", "None of these"],
    correctAnswer: "1"
  },
  {
    question: "What is the probability of an impossible event?",
    options: ["0", "0.5", "1", "-1"],
    correctAnswer: "0"
  },
  {
    question: "If $P(A) = \\frac{1}{3}$, what are the odds against the occurrence of event $A$?",
    options: ["$1:2$", "$2:1$", "$1:3$", "$3:1$"],
    correctAnswer: "$2:1$"
  },
  {
    question: "If the odds in favor of an event are $3:5$, what is the probability of the event?",
    options: ["$\\frac{3}{5}$", "$\\frac{5}{3}$", "$\\frac{3}{8}$", "$\\frac{5}{8}$"],
    correctAnswer: "$\\frac{3}{8}$"
  },
  {
    question: "A box contains 5 red and 7 blue balls. A ball is drawn at random. What is the probability that it is red?",
    options: ["$\\frac{5}{12}$", "$\\frac{7}{12}$", "$\\frac{5}{7}$", "$\\frac{7}{5}$"],
    correctAnswer: "$\\frac{5}{12}$"
  },
  {
    question: "A letter is chosen at random from the word 'PROBABILITY'. What is the probability that it is a vowel?",
    options: ["$\\frac{3}{11}$", "$\\frac{4}{11}$", "$\\frac{5}{11}$", "$\\frac{2}{11}$"],
    correctAnswer: "$\\frac{4}{11}$"
  },
  {
    question: "A single die is thrown. Find the probability of getting a number less than or equal to 6.",
    options: ["0", "$\\frac{1}{2}$", "$\\frac{5}{6}$", "1"],
    correctAnswer: "1"
  },
  {
    question: "Three fair coins are tossed. Find the probability of getting all heads.",
    options: ["$\\frac{1}{8}$", "$\\frac{1}{4}$", "$\\frac{3}{8}$", "$\\frac{1}{2}$"],
    correctAnswer: "$\\frac{1}{8}$"
  },
  {
    question: "If $P(A) = \\frac{3}{10}$ and $P(B) = \\frac{2}{5}$ for two mutually exclusive events $A$ and $B$, find $P(A \\cup B)$.",
    options: ["$\\frac{7}{10}$", "$\\frac{3}{5}$", "$\\frac{1}{2}$", "$\\frac{9}{10}$"],
    correctAnswer: "$\\frac{7}{10}$"
  },
  {
    question: "A card is drawn from a deck of 52 cards. What is the probability of drawing a black queen?",
    options: ["$\\frac{1}{26}$", "$\\frac{1}{13}$", "$\\frac{1}{52}$", "$\\frac{2}{13}$"],
    correctAnswer: "$\\frac{1}{26}$"
  },
  {
    question: "If $P(A) = 0.6$, $P(B) = 0.5$, and $P(A \\cap B) = 0.3$, find $P(A \\cup B)$.",
    options: ["0.8", "0.9", "0.7", "1.1"],
    correctAnswer: "0.8"
  },
  {
    question: "Two ordinary dice are thrown. What is the probability of getting a sum of 2?",
    options: ["$\\frac{1}{36}$", "$\\frac{1}{18}$", "$\\frac{1}{12}$", "$\\frac{1}{6}$"],
    correctAnswer: "$\\frac{1}{36}$"
  },
  {
    question: "A single card is drawn from a pack of 52 cards. Find the probability of getting a club or a spade?",
    options: ["$\\frac{1}{4}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$", "$\\frac{1}{13}$"],
    correctAnswer: "$\\frac{1}{2}$"
  },
  {
    question: "Two coins are tossed. What is the probability of getting no heads?",
    options: ["$\\frac{1}{4}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$", "0"],
    correctAnswer: "$\\frac{1}{4}$"
  },
  {
    question: "A number is selected at random from the numbers 1 to 20. Find the probability that it is a prime number.",
    options: ["$\\frac{2}{5}$", "$\\frac{3}{10}$", "$\\frac{9}{20}$", "$\\frac{7}{20}$"],
    correctAnswer: "$\\frac{2}{5}$"
  },
  {
    question: "A box contains 3 red, 4 white, and 5 blue marbles. One marble is drawn at random. What is the probability that it is white?",
    options: ["$\\frac{1}{4}$", "$\\frac{1}{3}$", "$\\frac{5}{12}$", "$\\frac{1}{2}$"],
    correctAnswer: "$\\frac{1}{3}$"
  },
  {
    question: "Two events $A$ and $B$ are such that $P(A) = \\frac{1}{4}$ and $P(B) = \\frac{1}{2}$. If they are mutually exclusive, what is $P(A \\cap B)$?",
    options: ["$\\frac{3}{4}$", "$\\frac{1}{8}$", "0", "$\\frac{1}{2}$"],
    correctAnswer: "0"
  },
  {
    question: "An integer is chosen from 1 to 10. The probability that it is odd is:",
    options: ["$\\frac{1}{2}$", "$\\frac{2}{5}$", "$\\frac{3}{5}$", "$\\frac{1}{10}$"],
    correctAnswer: "$\\frac{1}{2}$"
  },
  {
    question: "A coin is tossed. If it shows head, a die is thrown. What is the probability of getting a head and an even number?",
    options: ["$\\frac{1}{4}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$", "$\\frac{1}{3}$"],
    correctAnswer: "$\\frac{1}{4}$"
  },

  // ==========================================
  // MEDIUM QUESTIONS (30 questions, 31 to 60)
  // ==========================================
  {
    question: "Two dice are thrown simultaneously. Find the probability that the sum of the numbers is a prime number.",
    options: ["$\\frac{5}{12}$", "$\\frac{7}{12}$", "$\\frac{1}{2}$", "$\\frac{11}{36}$"],
    correctAnswer: "$\\frac{5}{12}$"
  },
  {
    question: "Two dice are thrown simultaneously. Find the probability that the product of the numbers is even.",
    options: ["$\\frac{1}{4}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$", "$\\frac{5}{6}$"],
    correctAnswer: "$\\frac{3}{4}$"
  },
  {
    question: "Find the probability of getting 53 Sundays in a non-leap year.",
    options: ["$\\frac{1}{7}$", "$\\frac{2}{7}$", "$\\frac{3}{7}$", "$\\frac{53}{365}$"],
    correctAnswer: "$\\frac{1}{7}$"
  },
  {
    question: "Find the probability of getting 53 Sundays in a leap year.",
    options: ["$\\frac{1}{7}$", "$\\frac{2}{7}$", "$\\frac{3}{7}$", "$\\frac{53}{366}$"],
    correctAnswer: "$\\frac{2}{7}$"
  },
  {
    question: "Three dice are thrown simultaneously. What is the probability of getting a total of at least 5?",
    options: ["$\\frac{53}{54}$", "$\\frac{5}{6}$", "$\\frac{107}{108}$", "$\\frac{211}{216}$"],
    correctAnswer: "$\\frac{53}{54}$"
  },
  {
    question: "If $P(A) = 0.5$, $P(B) = 0.4$, and $P(A \\cap B) = 0.25$, find the probability of $P(A \\cap B')$.",
    options: ["0.25", "0.15", "0.35", "0.20"],
    correctAnswer: "0.25"
  },
  {
    question: "Two cards are drawn together from a well-shuffled pack of 52 cards. Find the probability that both are kings.",
    options: ["$\\frac{1}{221}$", "$\\frac{1}{13}$", "$\\frac{1}{26}$", "$\\frac{2}{13}$"],
    correctAnswer: "$\\frac{1}{221}$"
  },
  {
    question: "Out of 100 students, 60 study Mathematics, 40 study Physics, and 20 study both. If a student is selected at random, find the probability that they study Mathematics or Physics.",
    options: ["0.8", "0.6", "0.7", "0.9"],
    correctAnswer: "0.8"
  },
  {
    question: "Five fair coins are tossed simultaneously. What is the probability of getting at least 3 heads?",
    options: ["$\\frac{1}{2}$", "$\\frac{5}{16}$", "$\\frac{9}{16}$", "$\\frac{11}{32}$"],
    correctAnswer: "$\\frac{1}{2}$"
  },
  {
    question: "If the probability of an event $A$ is $\\frac{2}{7}$, what are the odds in favor of $A$?",
    options: ["$2:5$", "$5:2$", "$2:7$", "$7:2$"],
    correctAnswer: "$2:5$"
  },
  {
    question: "A card is drawn from a well-shuffled pack of 52 cards. What is the probability that it is either a red card or a face card?",
    options: ["$\\frac{8}{13}$", "$\\frac{9}{13}$", "$\\frac{10}{13}$", "$\\frac{11}{13}$"],
    correctAnswer: "$\\frac{8}{13}$"
  },
  {
    question: "If $P(A \\cup B) = 0.8$, $P(A) = 0.5$, and $P(B') = 0.6$, find $P(A \\cap B)$.",
    options: ["0.1", "0.2", "0.3", "0.4"],
    correctAnswer: "0.1"
  },
  {
    question: "An urn contains 6 red, 4 blue, and 2 green balls. If 2 balls are drawn at random, what is the probability that both are red?",
    options: ["$\\frac{5}{22}$", "$\\frac{1}{4}$", "$\\frac{5}{11}$", "$\\frac{7}{22}$"],
    correctAnswer: "$\\frac{5}{22}$"
  },
  {
    question: "From a pack of 52 cards, two cards are drawn at random. What is the probability that one is a spade and the other is a heart?",
    options: ["$\\frac{13}{102}$", "$\\frac{13}{51}$", "$\\frac{26}{51}$", "$\\frac{1}{4}$"],
    correctAnswer: "$\\frac{13}{102}$"
  },
  {
    question: "If $A$ and $B$ are two events such that $P(A) = 0.6$ and $P(B) = 0.7$, what is the minimum possible value of $P(A \\cap B)$?",
    options: ["0.1", "0.3", "0.5", "0.6"],
    correctAnswer: "0.3"
  },
  {
    question: "What is the probability that all four S's in the word 'ASSASSIN' come consecutively when all letters are arranged in a row at random?",
    options: ["$\\frac{1}{14}$", "$\\frac{1}{28}$", "$\\frac{5}{28}$", "$\\frac{3}{14}$"],
    correctAnswer: "$\\frac{1}{14}$"
  },
  {
    question: "In a class of 60 students, 30 opted for NCC, 35 opted for NSS, and 20 opted for both. If a student is selected at random, what is the probability that the student opted for neither NCC nor NSS?",
    options: ["$\\frac{1}{4}$", "$\\frac{1}{3}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$"],
    correctAnswer: "$\\frac{1}{4}$"
  },
  {
    question: "A committee of 3 persons is to be constituted from a group of 2 men and 3 women. What is the probability that the committee contains 1 man and 2 women?",
    options: ["$\\frac{3}{5}$", "$\\frac{2}{5}$", "$\\frac{3}{10}$", "$\\frac{1}{2}$"],
    correctAnswer: "$\\frac{3}{5}$"
  },
  {
    question: "Two ordinary dice are rolled. What is the probability that the numbers shown have an absolute difference of 2?",
    options: ["$\\frac{2}{9}$", "$\\frac{1}{6}$", "$\\frac{1}{9}$", "$\\frac{5}{18}$"],
    correctAnswer: "$\\frac{2}{9}$"
  },
  {
    question: "Two numbers are chosen at random from the digits $1, 2, 3, \\dots, 9$ without replacement. What is the probability that their sum is even?",
    options: ["$\\frac{4}{9}$", "$\\frac{5}{9}$", "$\\frac{1}{2}$", "$\\frac{7}{18}$"],
    correctAnswer: "$\\frac{4}{9}$"
  },
  {
    question: "A bag contains 4 red, 5 black, and 6 white balls. If 3 balls are drawn at random, what is the probability that all 3 are of different colors?",
    options: ["$\\frac{20}{91}$", "$\\frac{24}{91}$", "$\\frac{30}{91}$", "$\\frac{40}{91}$"],
    correctAnswer: "$\\frac{24}{91}$"
  },
  {
    question: "Four cards are drawn from a well-shuffled pack of 52 cards. What is the probability that there is exactly one card of each suit?",
    options: ["$\\frac{13^4}{52C4}$", "$\\frac{13}{52}$", "$\\frac{4 \\times 13}{52C4}$", "$\\frac{4!}{52C4}$"],
    correctAnswer: "$\\frac{13^4}{52C4}$"
  },
  {
    question: "If $P(A \\cup B) = P(A \\cap B)$ for two events $A$ and $B$, then which of the following is correct?",
    options: ["$P(A) = P(B)$", "$P(A) = 1$", "$P(B) = 0$", "None of these"],
    correctAnswer: "$P(A) = P(B)$"
  },
  {
    question: "Let $A$ and $B$ be two events such that $P(A) = 0.35$ and $P(A \\cup B) = 0.6$. If $A$ and $B$ are mutually exclusive, what is $P(B)$?",
    options: ["0.25", "0.35", "0.60", "0.95"],
    correctAnswer: "0.25"
  },
  {
    question: "A die is loaded such that even faces are twice as likely to occur as odd faces. What is the probability of getting a prime number when this die is thrown once?",
    options: ["$\\frac{4}{9}$", "$\\frac{5}{9}$", "$\\frac{1}{2}$", "$\\frac{2}{3}$"],
    correctAnswer: "$\\frac{4}{9}$"
  },
  {
    question: "A number is selected from the first 50 natural numbers. What is the probability that it is divisible by 3 or 4?",
    options: ["$\\frac{6}{25}$", "$\\frac{12}{25}$", "$\\frac{13}{25}$", "$\\frac{14}{25}$"],
    correctAnswer: "$\\frac{12}{25}$"
  },
  {
    question: "Two numbers are selected from the set $\\{1, 2, 3, \\dots, 10\\}$ without replacement. What is the probability that their product is a multiple of 3?",
    options: ["$\\frac{8}{15}$", "$\\frac{7}{15}$", "$\\frac{2}{3}$", "$\\frac{3}{5}$"],
    correctAnswer: "$\\frac{8}{15}$"
  },
  {
    question: "If $A, B, C$ are three mutually exclusive and exhaustive events, and if $P(B) = \\frac{3}{2}P(A)$ and $P(C) = 2P(B)$, find $P(A)$.",
    options: ["$\\frac{2}{11}$", "$\\frac{3}{11}$", "$\\frac{4}{11}$", "$\\frac{1}{11}$"],
    correctAnswer: "$\\frac{2}{11}$"
  },
  {
    question: "If $A, B, C$ are pairwise mutually exclusive events with $P(A) = 0.2$, $P(B) = 0.3$, and $P(C) = 0.4$, find $P(A' \\cap B' \\cap C')$.",
    options: ["0.9", "0.1", "0.24", "0.76"],
    correctAnswer: "0.1"
  },
  {
    question: "Two independent events $A$ and $B$ have probabilities $P(A) = \\frac{1}{2}$ and $P(B) = \\frac{1}{3}$. Find the probability that at least one of them occurs.",
    options: ["$\\frac{5}{6}$", "$\\frac{2}{3}$", "$\\frac{1}{6}$", "$\\frac{1}{2}$"],
    correctAnswer: "$\\frac{2}{3}$"
  },

  // ==========================================
  // HARD QUESTIONS (40 questions, 61 to 100)
  // ==========================================
  {
    question: "Seven letters are placed in seven addressed envelopes at random. What is the probability that at least one letter goes to the correct envelope?",
    options: ["$\\frac{177}{280}$", "$\\frac{103}{280}$", "$\\frac{1}{7}$", "$\\frac{6}{7}$"],
    correctAnswer: "$\\frac{177}{280}$"
  },
  {
    question: "A box contains 100 tickets numbered 1 to 100. Three tickets are drawn at random without replacement. What is the probability that the numbers on the tickets are in arithmetic progression?",
    options: ["$\\frac{1}{66}$", "$\\frac{1}{33}$", "$\\frac{1}{50}$", "$\\frac{3}{200}$"],
    correctAnswer: "$\\frac{1}{66}$"
  },
  {
    question: "If 4 cards are drawn from a well-shuffled pack of 52 cards, what is the probability of getting 2 jacks and 2 queens?",
    options: ["$\\frac{36}{270725}$", "$\\frac{18}{270725}$", "$\\frac{6}{270725}$", "$\\frac{72}{270725}$"],
    correctAnswer: "$\\frac{36}{270725}$"
  },
  {
    question: "In a lottery of 50 tickets numbered 1 to 50, two tickets are drawn simultaneously. What is the probability that both tickets have prime numbers?",
    options: ["$\\frac{7}{35}$", "$\\frac{21}{245}$", "$\\frac{3}{35}$", "$\\frac{2}{35}$"],
    correctAnswer: "$\\frac{3}{35}$"
  },
  {
    question: "Three numbers are chosen at random from $\\{1, 2, 3, \\dots, 20\\}$ without replacement. What is the probability that their product is divisible by 4?",
    options: ["$\\frac{53}{76}$", "$\\frac{23}{76}$", "$\\frac{19}{38}$", "$\\frac{11}{38}$"],
    correctAnswer: "$\\frac{53}{76}$"
  },
  {
    question: "A four-digit number is formed using the digits 1, 2, 3, 4, 5 without repetition. What is the probability that the number is divisible by 4?",
    options: ["$\\frac{1}{5}$", "$\\frac{2}{5}$", "$\\frac{3}{5}$", "$\\frac{4}{5}$"],
    correctAnswer: "$\\frac{1}{5}$"
  },
  {
    question: "If a letter is chosen at random from the English alphabet, what is the probability that it is a letter of the word 'MATHEMATICS'?",
    options: ["$\\frac{4}{13}$", "$\\frac{11}{26}$", "$\\frac{8}{26}$", "$\\frac{9}{26}$"],
    correctAnswer: "$\\frac{4}{13}$"
  },
  {
    question: "A coin is tossed $n$ times. If the probability of getting at least one head is greater than 0.99, find the minimum value of $n$.",
    options: ["6", "7", "8", "10"],
    correctAnswer: "7"
  },
  {
    question: "A bag contains $n$ white and 3 red balls. If two balls are drawn at random without replacement, and the probability of drawing two white balls is $\\frac{5}{12}$, find the value of $n$.",
    options: ["5", "6", "8", "9"],
    correctAnswer: "6"
  },
  {
    question: "If two events $A$ and $B$ are such that $P(A') = 0.3$, $P(B) = 0.4$, and $P(A \\cap B') = 0.5$, then find $P(A \\cup B)$.",
    options: ["0.8", "0.7", "0.9", "0.6"],
    correctAnswer: "0.9"
  },
  {
    question: "A committee of 4 is to be chosen from a group of 5 men and 4 women. What is the probability that the committee contains a majority of women?",
    options: ["$\\frac{1}{6}$", "$\\frac{5}{14}$", "$\\frac{11}{42}$", "$\\frac{1}{3}$"],
    correctAnswer: "$\\frac{1}{6}$"
  },
  {
    question: "What is the probability that in a group of 3 people, at least two have the same birth month? (Assume equal probability for all months).",
    options: ["$\\frac{17}{72}$", "$\\frac{5}{72}$", "$\\frac{19}{72}$", "$\\frac{7}{24}$"],
    correctAnswer: "$\\frac{17}{72}$"
  },
  {
    question: "Ten people are seated randomly at a round table. What is the probability that two particular people are seated next to each other?",
    options: ["$\\frac{2}{9}$", "$\\frac{1}{9}$", "$\\frac{2}{5}$", "$\\frac{1}{5}$"],
    correctAnswer: "$\\frac{2}{9}$"
  },
  {
    question: "If the letters of the word 'UNIVERSITY' are arranged in a row, what is the probability that the two I's are together?",
    options: ["$\\frac{1}{5}$", "$\\frac{1}{10}$", "$\\frac{2}{5}$", "$\\frac{1}{2}$"],
    correctAnswer: "$\\frac{1}{5}$"
  },
  {
    question: "A bag contains 5 white, 7 red, and 8 black balls. If four balls are drawn one by one without replacement, what is the probability that at least one is red?",
    options: ["$\\frac{826}{969}$", "$\\frac{143}{969}$", "$\\frac{820}{969}$", "$\\frac{830}{969}$"],
    correctAnswer: "$\\frac{826}{969}$"
  },
  {
    question: "A number $x$ is chosen at random from the set $\\{1, 2, 3, \\ldots, 100\\}$. What is the probability that $x + \\frac{100}{x} > 29$?",
    options: ["0.78", "0.75", "0.80", "0.76"],
    correctAnswer: "0.78"
  },
  {
    question: "Three dice are thrown. What is the probability of getting a sum which is a perfect square?",
    options: ["$\\frac{17}{108}$", "$\\frac{17}{216}$", "$\\frac{19}{108}$", "$\\frac{19}{216}$"],
    correctAnswer: "$\\frac{17}{108}$"
  },
  {
    question: "Two integers $a$ and $b$ are chosen at random from the set $\\{1, 2, 3, \\ldots, 10\\}$ with replacement. What is the probability that the equation $x^2 + ax + b = 0$ has real roots?",
    options: ["0.62", "0.38", "0.45", "0.55"],
    correctAnswer: "0.62"
  },
  {
    question: "Let $S = \\{1, 2, 3, \\dots, 20\\}$. A subset $A$ of $S$ is chosen at random. What is the probability that the sum of elements in $A$ is even?",
    options: ["$\\frac{1}{2}$", "$\\frac{1}{4}$", "$\\frac{3}{4}$", "$\\frac{1}{2^{10}}$"],
    correctAnswer: "$\\frac{1}{2}$"
  },
  {
    question: "If 10 identical coins are distributed among 3 people at random, what is the probability that at least one person gets no coins?",
    options: ["$\\frac{5}{11}$", "$\\frac{6}{11}$", "$\\frac{7}{11}$", "$\\frac{8}{11}$"],
    correctAnswer: "$\\frac{5}{11}$"
  },
  {
    question: "What is the probability that a leap year selected at random contains 53 Sundays or 53 Mondays?",
    options: ["$\\frac{2}{7}$", "$\\frac{3}{7}$", "$\\frac{4}{7}$", "$\\frac{5}{7}$"],
    correctAnswer: "$\\frac{3}{7}$"
  },
  {
    question: "In a sequence of coin tosses, a fair coin is tossed until a head appears. What is the probability that the number of tosses required is even?",
    options: ["$\\frac{1}{3}$", "$\\frac{2}{3}$", "$\\frac{1}{2}$", "$\\frac{1}{4}$"],
    correctAnswer: "$\\frac{1}{3}$"
  },
  {
    question: "Six boys and six girls sit in a row randomly. What is the probability that the boys and girls sit alternately?",
    options: ["$\\frac{1}{462}$", "$\\frac{1}{924}$", "$\\frac{1}{231}$", "$\\frac{1}{132}$"],
    correctAnswer: "$\\frac{1}{462}$"
  },
  {
    question: "Three vertices are chosen at random from the vertices of a regular octagon. What is the probability that they form a right-angled triangle?",
    options: ["$\\frac{3}{7}$", "$\\frac{4}{7}$", "$\\frac{1}{2}$", "$\\frac{5}{7}$"],
    correctAnswer: "$\\frac{3}{7}$"
  },
  {
    question: "If $A$ and $B$ are two events such that $P(A) = p_1$, $P(B) = p_2$, and $P(A \\cap B) = p_3$, find the probability that exactly one of the events $A$ or $B$ occurs.",
    options: ["$p_1 + p_2 - p_3$", "$p_1 + p_2 - 2p_3$", "$p_1 + p_2$", "$2p_1 + 2p_2 - p_3$"],
    correctAnswer: "$p_1 + p_2 - 2p_3$"
  },
  {
    question: "If a number is chosen from $\\{10, 11, 12, \\dots, 99\\}$, what is the probability that it is divisible by 3 or 5?",
    options: ["$\\frac{7}{15}$", "$\\frac{8}{15}$", "$\\frac{3}{5}$", "$\\frac{2}{3}$"],
    correctAnswer: "$\\frac{7}{15}$"
  },
  {
    question: "A five-digit number is formed using the digits $\\{0, 1, 2, 3, 4, 5\\}$ without repetition. What is the probability that the number is divisible by 6?",
    options: ["$\\frac{9}{50}$", "$\\frac{11}{50}$", "$\\frac{7}{50}$", "$\\frac{13}{50}$"],
    correctAnswer: "$\\frac{9}{50}$"
  },
  {
    question: "Five cards are drawn at random from a standard pack of 52 cards. What is the probability that all 5 cards are of the same suit?",
    options: ["$\\frac{33}{16660}$", "$\\frac{11}{4165}$", "$\\frac{33}{4165}$", "$\\frac{11}{16660}$"],
    correctAnswer: "$\\frac{33}{16660}$"
  },
  {
    question: "From a bag containing 3 red and 7 white balls, balls are drawn one by one without replacement until all red balls are drawn. What is the probability that this process ends in exactly 5 draws?",
    options: ["$\\frac{1}{12}$", "$\\frac{1}{15}$", "$\\frac{1}{10}$", "$\\frac{1}{20}$"],
    correctAnswer: "$\\frac{1}{20}$"
  },
  {
    question: "Two numbers $x$ and $y$ are selected at random from the set $\\{1, 2, 3, \\dots, 3n\\}$. What is the probability that $x^2 - y^2$ is divisible by 3?",
    options: ["$\\frac{5n-3}{9n-3}$", "$\\frac{5n-1}{9n-3}$", "$\\frac{5n-2}{9n-3}$", "$\\frac{5n-1}{9n-1}$"],
    correctAnswer: "$\\frac{5n-3}{9n-3}$"
  },
  {
    question: "If the letters of the word 'PROBABILITY' are arranged in a row at random, what is the probability that the two B's are not together?",
    options: ["$\\frac{9}{11}$", "$\\frac{2}{11}$", "$\\frac{10}{11}$", "$\\frac{1}{11}$"],
    correctAnswer: "$\\frac{9}{11}$"
  },
  {
    question: "If 12 identical apples are distributed at random among 4 children, what is the probability that each child gets at least 2 apples?",
    options: ["$\\frac{7}{91}$", "$\\frac{14}{91}$", "$\\frac{28}{91}$", "$\\frac{35}{91}$"],
    correctAnswer: "$\\frac{7}{91}$"
  },
  {
    question: "A fair die is rolled 4 times. What is the probability that the maximum number rolled is exactly 4?",
    options: ["$\\frac{175}{1296}$", "$\\frac{125}{1296}$", "$\\frac{371}{1296}$", "$\\frac{256}{1296}$"],
    correctAnswer: "$\\frac{175}{1296}$"
  },
  {
    question: "A box contains 3 red and 7 black balls. Two balls are drawn at random, one after another, without replacement. If the second ball is red, what is the probability that the first ball was also red?",
    options: ["$\\frac{2}{9}$", "$\\frac{3}{10}$", "$\\frac{1}{3}$", "$\\frac{1}{5}$"],
    correctAnswer: "$\\frac{2}{9}$"
  },
  {
    question: "If 5 letters are placed at random in 5 addressed envelopes, what is the probability that exactly 3 letters go to the correct envelopes?",
    options: ["$\\frac{1}{12}$", "$\\frac{1}{24}$", "$\\frac{1}{8}$", "$\\frac{1}{6}$"],
    correctAnswer: "$\\frac{1}{12}$"
  },
  {
    question: "Out of 30 tickets numbered 1 to 30, three tickets are drawn at random without replacement. What is the probability that the product of the numbers on the tickets is a multiple of 3?",
    options: ["$\\frac{146}{203}$", "$\\frac{57}{203}$", "$\\frac{150}{203}$", "$\\frac{140}{203}$"],
    correctAnswer: "$\\frac{146}{203}$"
  },
  {
    question: "An urn contains 4 white and 6 black balls. Three balls are drawn at random. What is the probability that the number of white balls drawn is greater than the number of black balls drawn?",
    options: ["$\\frac{1}{3}$", "$\\frac{2}{3}$", "$\\frac{2}{5}$", "$\\frac{3}{10}$"],
    correctAnswer: "$\\frac{1}{3}$"
  },
  {
    question: "In a single throw of three dice, what is the probability of getting a sum which is a multiple of 5?",
    options: ["$\\frac{43}{216}$", "$\\frac{23}{108}$", "$\\frac{7}{36}$", "$\\frac{41}{216}$"],
    correctAnswer: "$\\frac{43}{216}$"
  },
  {
    question: "Two persons $A$ and $B$ toss a fair coin alternately. The first person to get a head wins the game. If $A$ starts the game, what is the probability that $A$ wins?",
    options: ["$\\frac{2}{3}$", "$\\frac{1}{3}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$"],
    correctAnswer: "$\\frac{2}{3}$"
  },
  {
    question: "Five distinct items are distributed randomly into three distinct boxes. What is the probability that no box is left empty?",
    options: ["$\\frac{25}{27}$", "$\\frac{50}{81}$", "$\\frac{20}{27}$", "$\\frac{40}{81}$"],
    correctAnswer: "$\\frac{50}{81}$"
  }
];

async function seed() {
  console.log('Connecting to database...');
  await connectDB();

  // Find class and chapter
  const classDoc = await Class.findOne({ classId: 11 });
  if (!classDoc) {
    console.error('Class 11 not found in classes collection!');
    process.exit(1);
  }
  const classId = classDoc._id;

  const chapterDoc = await Chapter.findOne({ classId, normalizedChapterName: 'probability' });
  if (!chapterDoc) {
    console.error('Probability chapter not found for Class 11 in chapters collection!');
    process.exit(1);
  }
  const chapterId = chapterDoc._id;

  console.log(`Using classId: ${classId} ("Class 11")`);
  console.log(`Using chapterId: ${chapterId} ("Probability")`);

  let addedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < questionsData.length; i++) {
    const qData = questionsData[i];
    
    // Construct question object conforming to Mongoose schema
    const newQuestion = new Question({
      language: 'Both',
      classId: classId,
      chapterId: chapterId,
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
      if (addedCount % 10 === 0) {
        console.log(`Saved ${addedCount} questions so far...`);
      }
    } catch (err) {
      if (err.code === 11000) {
        duplicateCount++;
      } else {
        console.error(`Error saving question ${i + 1}: ${err.message}`);
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
