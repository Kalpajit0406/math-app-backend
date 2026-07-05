/**
 * Seeding script to add 100 questions in Probability chapter for Class 12.
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

const probabilityQuestions = [
  // ==========================================
  // PROBABILITY: EASY (30 questions, 1 to 30)
  // ==========================================
  {
    question: "If $P(A) = 0.6$, $P(B) = 0.5$, and $P(A \\cap B) = 0.3$, find the conditional probability $P(A|B)$.",
    options: ["0.3", "0.5", "0.6", "0.8"],
    correctAnswer: "0.6"
  },
  {
    question: "If $P(B|A) = 0.4$ and $P(A) = 0.5$, find the probability of the intersection $P(A \\cap B)$.",
    options: ["0.2", "0.4", "0.5", "0.9"],
    correctAnswer: "0.2"
  },
  {
    question: "If $A$ and $B$ are independent events with $P(A) = 0.3$ and $P(B) = 0.4$, find $P(A \\cap B)$.",
    options: ["0.12", "0.7", "0.1", "0.5"],
    correctAnswer: "0.12"
  },
  {
    question: "If $A$ and $B$ are independent events, find $P(A \\cup B)$ when $P(A) = 0.3$ and $P(B) = 0.4$.",
    options: ["0.58", "0.70", "0.12", "0.88"],
    correctAnswer: "0.58"
  },
  {
    question: "If $P(A|B) = 0.8$ and $P(B) = 0.5$, find the probability of the intersection $P(A \\cap B)$.",
    options: ["0.4", "0.3", "0.8", "0.5"],
    correctAnswer: "0.4"
  },
  {
    question: "If $P(B) = 0$, then the conditional probability $P(A|B)$ is:",
    options: ["0", "1", "Not defined", "0.5"],
    correctAnswer: "Not defined"
  },
  {
    question: "If $P(A) = \\frac{7}{13}$, $P(B) = \\frac{9}{13}$, and $P(A \\cap B) = \\frac{4}{13}$, find $P(A|B)$.",
    options: ["$\\frac{4}{9}$", "$\\frac{4}{7}$", "$\\frac{9}{13}$", "$\\frac{7}{9}$"],
    correctAnswer: "$\\frac{4}{9}$"
  },
  {
    question: "If $P(A) = \\frac{7}{13}$, $P(B) = \\frac{9}{13}$, and $P(A \\cap B) = \\frac{4}{13}$, find $P(B|A)$.",
    options: ["$\\frac{4}{9}$", "$\\frac{4}{7}$", "$\\frac{9}{13}$", "$\\frac{7}{9}$"],
    correctAnswer: "$\\frac{4}{7}$"
  },
  {
    question: "If $P(A) = 0.8$, $P(B) = 0.5$, and $P(B|A) = 0.4$, find $P(A|B)$.",
    options: ["0.64", "0.32", "0.40", "0.80"],
    correctAnswer: "0.64"
  },
  {
    question: "If $A$ and $B$ are independent events, then which of the following is correct?",
    options: ["$P(A|B) = P(A)$", "$P(A|B) = P(B)$", "$P(A) = P(B)$", "None of these"],
    correctAnswer: "$P(A|B) = P(A)$"
  },
  {
    question: "If $A$ and $B$ are mutually exclusive events, then $P(A|B)$ is:",
    options: ["0", "1", "$P(A)$", "None of these"],
    correctAnswer: "0"
  },
  {
    question: "If $A$ is a subset of $B$ (i.e. $A \\subseteq B$), then the conditional probability $P(A|B)$ is:",
    options: ["$\\frac{P(A)}{P(B)}$", "$\\frac{P(B)}{P(A)}$", "0", "1"],
    correctAnswer: "$\\frac{P(A)}{P(B)}$"
  },
  {
    question: "If $A$ and $B$ are independent events, then the complement events $A'$ and $B'$ are:",
    options: ["Independent", "Mutually exclusive", "Dependent", "None of these"],
    correctAnswer: "Independent"
  },
  {
    question: "If $A$ and $B$ are independent events, then $A$ and $B'$ are:",
    options: ["Independent", "Mutually exclusive", "Dependent", "None of these"],
    correctAnswer: "Independent"
  },
  {
    question: "If $A$ and $B$ are independent events, then $A'$ and $B$ are:",
    options: ["Independent", "Mutually exclusive", "Dependent", "None of these"],
    correctAnswer: "Independent"
  },
  {
    question: "Two fair coins are tossed. Find the probability of getting at least one head, given that at least one tail has appeared.",
    options: ["$\\frac{2}{3}$", "$\\frac{1}{2}$", "$\\frac{1}{3}$", "$\\frac{3}{4}$"],
    correctAnswer: "$\\frac{2}{3}$"
  },
  {
    question: "A fair die is thrown. Find the probability of getting a prime number, given that an odd number has appeared.",
    options: ["$\\frac{2}{3}$", "$\\frac{1}{3}$", "$\\frac{1}{2}$", "1"],
    correctAnswer: "$\\frac{2}{3}$"
  },
  {
    question: "If $P(A) = 0.4$, $P(B) = p$, and $P(A \\cup B) = 0.7$ where $A$ and $B$ are mutually exclusive, find the value of $p$.",
    options: ["0.3", "0.2", "0.4", "0.5"],
    correctAnswer: "0.3"
  },
  {
    question: "If $P(A) = 0.4$, $P(B) = p$, and $P(A \\cup B) = 0.6$ where $A$ and $B$ are independent, find the value of $p$.",
    options: ["$\\frac{1}{3}$", "$\\frac{1}{4}$", "$\\frac{1}{2}$", "$\\frac{2}{3}$"],
    correctAnswer: "$\\frac{1}{3}$"
  },
  {
    question: "Let $X$ be a random variable with probability distribution $P(X=0)=0.2, P(X=1)=k, P(X=2)=0.3, P(X=3)=2k$. Find the value of $k$.",
    options: ["$\\frac{1}{6}$", "$\\frac{1}{3}$", "$\\frac{1}{4}$", "$\\frac{1}{5}$"],
    correctAnswer: "$\\frac{1}{6}$"
  },
  {
    question: "If a random variable $X$ has mean $\\mu$ and variance $\\sigma^2$, then $E(X^2)$ is equal to:",
    options: ["$\\mu^2 + \\sigma^2$", "$\\mu^2 - \\sigma^2$", "$\\sigma^2 - \\mu^2$", "None of these"],
    correctAnswer: "$\\mu^2 + \\sigma^2$"
  },
  {
    question: "In a Bernoulli trial, if the probability of success is $p$ and failure is $q$, then which of the following is correct?",
    options: ["$p + q = 1$", "$p + q = 0.5$", "$pq = 1$", "None of these"],
    correctAnswer: "$p + q = 1$"
  },
  {
    question: "If a fair coin is tossed 3 times, what is the probability of getting exactly 3 heads?",
    options: ["$\\frac{1}{8}$", "$\\frac{3}{8}$", "$\\frac{1}{2}$", "$\\frac{1}{4}$"],
    correctAnswer: "$\\frac{1}{8}$"
  },
  {
    question: "If $P(A) = \\frac{1}{2}$ and $P(B) = 0$, then the conditional probability $P(A|B)$ is:",
    options: ["0", "$\\frac{1}{2}$", "Not defined", "1"],
    correctAnswer: "Not defined"
  },
  {
    question: "If $A$ and $B$ are two events such that $P(A|B) = P(B|A)$, then which of the following is correct?",
    options: ["$P(A) = P(B)$", "$P(A) = 1 - P(B)$", "$P(A) \\subset P(B)$", "None of these"],
    correctAnswer: "$P(A) = P(B)$"
  },
  {
    question: "If a random variable $X$ takes values $0, 1, 2$ with equal probabilities of $\\frac{1}{3}$ each, find the expectation $E(X)$.",
    options: ["1", "0.5", "1.5", "2"],
    correctAnswer: "1"
  },
  {
    question: "A fair die is rolled. Find the probability of getting an even number, given that the number rolled is greater than 3.",
    options: ["$\\frac{2}{3}$", "$\\frac{1}{3}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$"],
    correctAnswer: "$\\frac{2}{3}$"
  },
  {
    question: "If $P(A) = 0.3$, $P(B) = 0.6$, and $A$ and $B$ are independent, find the probability $P(A' \\cap B')$.",
    options: ["0.28", "0.18", "0.42", "0.72"],
    correctAnswer: "0.28"
  },
  {
    question: "If $P(A) = \\frac{1}{4}$, $P(B) = \\frac{1}{3}$, and $P(A \\cap B) = \\frac{1}{6}$, find the conditional probability $P(A|B')$.",
    options: ["$\\frac{1}{8}$", "$\\frac{1}{4}$", "$\\frac{1}{2}$", "$\\frac{3}{8}$"],
    correctAnswer: "$\\frac{1}{8}$"
  },
  {
    question: "If the variance of a random variable $X$ is 4, then the standard deviation is:",
    options: ["2", "4", "16", "1"],
    correctAnswer: "2"
  },

  // ==========================================
  // PROBABILITY: MEDIUM (30 questions, 31 to 60)
  // ==========================================
  {
    question: "Two cards are drawn from a standard pack of 52. What is the probability that both are black, given that at least one is black?",
    options: ["$\\frac{25}{77}$", "$\\frac{25}{51}$", "$\\frac{1}{2}$", "$\\frac{26}{51}$"],
    correctAnswer: "$\\frac{25}{77}$"
  },
  {
    question: "A family has two children. What is the probability that both are boys, given that at least one of them is a boy?",
    options: ["$\\frac{1}{3}$", "$\\frac{1}{2}$", "$\\frac{1}{4}$", "$\\frac{2}{3}$"],
    correctAnswer: "$\\frac{1}{3}$"
  },
  {
    question: "A family has two children. What is the probability that both are boys, given that the elder child is a boy?",
    options: ["$\\frac{1}{2}$", "$\\frac{1}{3}$", "$\\frac{1}{4}$", "$\\frac{3}{4}$"],
    correctAnswer: "$\\frac{1}{2}$"
  },
  {
    question: "Three independent events $A, B, C$ have probabilities $0.2, 0.3, 0.4$ respectively. Find the probability that exactly one of them occurs.",
    options: ["0.452", "0.024", "0.916", "0.548"],
    correctAnswer: "0.452"
  },
  {
    question: "An urn contains 5 red and 5 black balls. A ball is drawn at random, its color is noted and returned to the urn. Moreover, 2 additional balls of the color drawn are put in the urn, and then a ball is drawn at random. What is the probability that the second ball is red?",
    options: ["$\\frac{1}{2}$", "$\\frac{5}{12}$", "$\\frac{7}{12}$", "$\\frac{3}{4}$"],
    correctAnswer: "$\\frac{1}{2}$"
  },
  {
    question: "A bag contains 4 red and 4 black balls. Another bag contains 2 red and 6 black balls. One of the two bags is selected at random and a ball is drawn from it which is found to be red. Find the probability that the ball is drawn from the first bag.",
    options: ["$\\frac{2}{3}$", "$\\frac{1}{3}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$"],
    correctAnswer: "$\\frac{2}{3}$"
  },
  {
    question: "A man is known to speak truth 3 out of 4 times. He throws an ordinary die and reports that it is a six. Find the probability that it is actually a six.",
    options: ["$\\frac{3}{8}$", "$\\frac{1}{8}$", "$\\frac{3}{4}$", "$\\frac{1}{6}$"],
    correctAnswer: "$\\frac{3}{8}$"
  },
  {
    question: "Let the probability of a bomb hitting a bridge be $\\frac{1}{2}$ and two direct hits are needed to destroy it. What is the minimum number of bombs that must be dropped so that the probability of destroying the bridge is greater than 0.9?",
    options: ["5", "6", "7", "8"],
    correctAnswer: "7"
  },
  {
    question: "If a random variable $X$ has the probability distribution where $X$ takes values $1, 2, 3, 4$ with probabilities $0.1, 0.2, 0.3, 0.4$ respectively. Find the variance of $X$.",
    options: ["1.0", "0.8", "1.2", "1.5"],
    correctAnswer: "1.0"
  },
  {
    question: "In 10 trials of a coin tossing experiment, what is the probability of getting at least 8 heads?",
    options: ["$\\frac{7}{128}$", "$\\frac{9}{128}$", "$\\frac{11}{128}$", "$\\frac{5}{64}$"],
    correctAnswer: "$\\frac{7}{128}$"
  },
  {
    question: "If $A$ and $B$ are two independent events such that $P(A \\cap B') = \\frac{3}{25}$ and $P(A' \\cap B) = \\frac{8}{25}$, find the probabilities $P(A)$ and $P(B)$ respectively (assuming $P(A) < P(B)$).",
    options: ["$\\frac{1}{5}$ and $\\frac{2}{5}$", "$\\frac{2}{5}$ and $\\frac{3}{5}$", "$\\frac{1}{5}$ and $\\frac{4}{5}$", "None of these"],
    correctAnswer: "$\\frac{1}{5}$ and $\\frac{2}{5}$"
  },
  {
    question: "A card from a pack of 52 cards is lost. From the remaining cards of the pack, two cards are drawn and are found to be diamonds. Find the probability of the lost card being a diamond.",
    options: ["$\\frac{11}{50}$", "$\\frac{13}{50}$", "$\\frac{1}{4}$", "$\\frac{9}{50}$"],
    correctAnswer: "$\\frac{11}{50}$"
  },
  {
    question: "If $A$ and $B$ are two events such that $P(A) \\neq 0$ and $P(B|A) = 1$, then which of the following is correct?",
    options: ["$A \\subseteq B$", "$B \\subseteq A$", "$A \\cap B = \\emptyset$", "None of these"],
    correctAnswer: "$A \\subseteq B$"
  },
  {
    question: "If $P(A|B) > P(A)$, then which of the following is correct?",
    options: ["$P(B|A) > P(B)$", "$P(B|A) < P(B)$", "$P(B|A) = P(B)$", "None of these"],
    correctAnswer: "$P(B|A) > P(B)$"
  },
  {
    question: "A coin is tossed 4 times. What is the probability of getting at least 1 head?",
    options: ["$\\frac{15}{16}$", "$\\frac{7}{8}$", "$\\frac{1}{16}$", "$\\frac{1}{2}$"],
    correctAnswer: "$\\frac{15}{16}$"
  },
  {
    question: "A pair of dice is thrown 4 times. If getting a doublet is considered a success, find the probability of getting exactly 2 successes.",
    options: ["$\\frac{25}{216}$", "$\\frac{5}{72}$", "$\\frac{25}{432}$", "$\\frac{1}{6}$"],
    correctAnswer: "$\\frac{25}{216}$"
  },
  {
    question: "The probability of hitting a target by a shooter is $\\frac{3}{4}$. How many minimum times must he fire so that the probability of hitting the target at least once is more than 0.99?",
    options: ["3", "4", "5", "6"],
    correctAnswer: "4"
  },
  {
    question: "If $A$ and $B$ are two events such that $P(A) = \\frac{1}{2}$, $P(B) = \\frac{1}{3}$, and $P(A \\cap B) = \\frac{1}{4}$, find $P(A'|B')$.",
    options: ["$\\frac{5}{8}$", "$\\frac{3}{8}$", "$\\frac{1}{2}$", "$\\frac{7}{8}$"],
    correctAnswer: "$\\frac{5}{8}$"
  },
  {
    question: "A random variable $X$ has a binomial distribution $B(6, p)$. If $P(X=1) = 16 P(X=5)$, find the value of $p$.",
    options: ["$\\frac{1}{3}$", "$\\frac{1}{4}$", "$\\frac{1}{2}$", "$\\frac{2}{3}$"],
    correctAnswer: "$\\frac{1}{3}$"
  },
  {
    question: "An urn contains 10 white and 3 black balls. Another urn contains 3 white and 5 black balls. Two balls are transferred from the first urn to the second urn and then a ball is drawn from the second urn. What is the probability that the ball drawn is white?",
    options: ["$\\frac{59}{130}$", "$\\frac{7}{13}$", "$\\frac{1}{2}$", "$\\frac{61}{130}$"],
    correctAnswer: "$\\frac{59}{130}$"
  },
  {
    question: "If the mean of a binomial distribution is 4 and its variance is 2, then the number of trials $n$ is:",
    options: ["8", "16", "12", "10"],
    correctAnswer: "8"
  },
  {
    question: "If $A$ and $B$ are two events such that $P(A) = 0.4$, $P(B) = 0.8$, and $P(B|A) = 0.6$, find the conditional probability $P(A|B)$.",
    options: ["0.3", "0.4", "0.6", "0.24"],
    correctAnswer: "0.3"
  },
  {
    question: "A card is drawn from a well-shuffled deck of 52 cards. What is the probability that it is a spade, given that it is a black card?",
    options: ["$\\frac{1}{2}$", "$\\frac{1}{4}$", "$\\frac{1}{13}$", "$\\frac{2}{13}$"],
    correctAnswer: "$\\frac{1}{2}$"
  },
  {
    question: "If $P(A) = 0.5$, $P(B) = 0.3$, and $P(A \\cap B) = 0.2$, find the conditional probability $P(A' | B')$.",
    options: ["$\\frac{4}{7}$", "$\\frac{3}{7}$", "$\\frac{1}{2}$", "$\\frac{5}{7}$"],
    correctAnswer: "$\\frac{4}{7}$"
  },
  {
    question: "An unbiased coin is tossed 6 times. Find the probability of getting at least 5 heads.",
    options: ["$\\frac{7}{64}$", "$\\frac{3}{32}$", "$\\frac{1}{64}$", "$\\frac{5}{64}$"],
    correctAnswer: "$\\frac{7}{64}$"
  },
  {
    question: "For a random variable $X$, we have $E(X) = 3$ and $E(X^2) = 11$. Find the variance of the transformed variable $2X + 3$.",
    options: ["8", "11", "5", "14"],
    correctAnswer: "8"
  },
  {
    question: "A box contains 3 red and 7 black balls. Two balls are drawn one by one without replacement. What is the probability that both are red?",
    options: ["$\\frac{1}{15}$", "$\\frac{3}{50}$", "$\\frac{6}{25}$", "$\\frac{2}{15}$"],
    correctAnswer: "$\\frac{1}{15}$"
  },
  {
    question: "A letter is chosen at random from the word 'ASSASSIN'. What is the probability that it is an 'S', given that it is a consonant?",
    options: ["$\\frac{4}{5}$", "$\\frac{2}{3}$", "$\\frac{1}{2}$", "$\\frac{3}{5}$"],
    correctAnswer: "$\\frac{4}{5}$"
  },
  {
    question: "Two dice are thrown. Find the probability that the sum of the numbers is 8, given that the first die shows an even number.",
    options: ["$\\frac{1}{6}$", "$\\frac{1}{12}$", "$\\frac{5}{36}$", "$\\frac{1}{4}$"],
    correctAnswer: "$\\frac{1}{6}$"
  },
  {
    question: "If the mean of a binomial distribution is 4 and variance is 3, what is the value of the parameter $n$?",
    options: ["16", "12", "8", "20"],
    correctAnswer: "16"
  },

  // ==========================================
  // PROBABILITY: HARD (40 questions, 61 to 100)
  // ==========================================
  {
    question: "In a test, an examinee either guesses or copies or knows the answer to a multiple choice question with four choices. The probability that he makes a guess is $\\frac{1}{3}$ and the probability that he copies is $\\frac{1}{6}$. The probability that his answer is correct, given that he copied it, is $\\frac{1}{8}$. Find the probability that he knew the answer to the question, given that he answered it correctly.",
    options: ["$\\frac{24}{29}$", "$\\frac{23}{29}$", "$\\frac{12}{29}$", "$\\frac{5}{29}$"],
    correctAnswer: "$\\frac{24}{29}$"
  },
  {
    question: "An item is manufactured by three machines A, B, C. Machine A produces 50%, B produces 30%, C produces 20%. The defective rates are 1%, 2%, 3% respectively. If an item is drawn at random and found to be defective, what is the probability that it was produced by machine A?",
    options: ["$\\frac{5}{17}$", "$\\frac{6}{17}$", "$\\frac{3}{17}$", "$\\frac{4}{17}$"],
    correctAnswer: "$\\frac{5}{17}$"
  },
  {
    question: "A card from a pack of 52 cards is lost. From the remaining cards of the pack, two cards are drawn and are found to be spades. Find the probability of the lost card being a club.",
    options: ["$\\frac{13}{50}$", "$\\frac{11}{50}$", "$\\frac{1}{4}$", "$\\frac{9}{50}$"],
    correctAnswer: "$\\frac{13}{50}$"
  },
  {
    question: "Two independent events $A$ and $B$ are such that the probability that both occur is $\\frac{1}{6}$ and the probability that neither occurs is $\\frac{1}{3}$. Find the probability $P(A)$.",
    options: ["$\\frac{1}{2}$ or $\\frac{1}{3}$", "$\\frac{2}{3}$ or $\\frac{1}{4}$", "$\\frac{1}{5}$ or $\\frac{2}{5}$", "None of these"],
    correctAnswer: "$\\frac{1}{2}$ or $\\frac{1}{3}$"
  },
  {
    question: "Three players A, B, C toss a coin in turn. The first to throw a head wins. A starts, then B, then C. Find the probability that B wins.",
    options: ["$\\frac{2}{7}$", "$\\frac{4}{7}$", "$\\frac{1}{7}$", "$\\frac{3}{7}$"],
    correctAnswer: "$\\frac{2}{7}$"
  },
  {
    question: "In a factory, machines A and B produce 60% and 40% of the total output. 2% of A's output is defective and 1% of B's output is defective. A product is selected at random and is found to be defective. Find the probability that it was produced by machine B.",
    options: ["$\\frac{1}{4}$", "$\\frac{3}{4}$", "$\\frac{1}{3}$", "$\\frac{2}{5}$"],
    correctAnswer: "$\\frac{1}{4}$"
  },
  {
    question: "A random variable $X$ has the following probability distribution where $X$ takes values $0, 1, 2, 3, 4, 5, 6, 7$ with probabilities $0, k, 2k, 2k, 3k, k^2, 2k^2, 7k^2 + k$ respectively. Find the value of $k$.",
    options: ["$\\frac{1}{10}$", "$\\frac{1}{5}$", "$\\frac{2}{5}$", "1"],
    correctAnswer: "$\\frac{1}{10}$"
  },
  {
    question: "For the probability distribution of $X$ given in the previous question (with $k=0.1$), find the probability $P(X \\ge 6)$.",
    options: ["0.19", "0.09", "0.29", "0.10"],
    correctAnswer: "0.19"
  },
  {
    question: "For the probability distribution of $X$ given in the previous question (with $k=0.1$), find the probability $P(0 < X < 5)$.",
    options: ["0.8", "0.6", "0.7", "0.9"],
    correctAnswer: "0.8"
  },
  {
    question: "A box contains 4 tickets numbered 1 to 4. Two tickets are drawn at random without replacement. Let $X$ denote the sum of the numbers on the two tickets. Find the expected value $E(X)$.",
    options: ["5", "4", "4.5", "6"],
    correctAnswer: "5"
  },
  {
    question: "A box contains 4 tickets numbered 1 to 4. Two tickets are drawn at random without replacement. Let $X$ denote the sum of the numbers on the two tickets. Find the variance $\\text{Var}(X)$.",
    options: ["$\\frac{5}{3}$", "$\\frac{4}{3}$", "2", "$\\frac{1}{3}$"],
    correctAnswer: "$\\frac{5}{3}$"
  },
  {
    question: "If a fair coin is tossed 10 times, what is the probability of getting exactly 5 heads?",
    options: ["$\\frac{63}{256}$", "$\\frac{125}{512}$", "$\\frac{63}{512}$", "$\\frac{35}{128}$"],
    correctAnswer: "$\\frac{63}{256}$"
  },
  {
    question: "A bag contains 3 white and 2 red balls. Another bag contains 4 white and 3 red balls. A ball is drawn at random from the first bag and put into the second bag. A ball is then drawn from the second bag. If it is found to be red, what is the probability that the transferred ball was white?",
    options: ["$\\frac{9}{17}$", "$\\frac{8}{17}$", "$\\frac{1}{2}$", "$\\frac{9}{19}$"],
    correctAnswer: "$\\frac{9}{17}$"
  },
  {
    question: "If the probability that a target is hit is 0.4. If 10 shots are fired, find the probability that the target is hit at least twice.",
    options: ["$1 - 4.6(0.6)^9$", "$1 - (0.6)^{10}$", "$1 - 1.4(0.6)^9$", "None of these"],
    correctAnswer: "$1 - 4.6(0.6)^9$"
  },
  {
    question: "Let $A$ and $B$ be two independent events such that $P(A) = p$ and $P(B) = 2p$. If the probability of occurrence of at least one of them is $\\frac{5}{8}$, find the value of $p$.",
    options: ["$\\frac{1}{4}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$", "$\\frac{1}{8}$"],
    correctAnswer: "$\\frac{1}{4}$"
  },
  {
    question: "An urn contains 4 red and 7 black balls. Two balls are drawn at random without replacement. What is the probability that the second ball is red?",
    options: ["$\\frac{4}{11}$", "$\\frac{3}{11}$", "$\\frac{7}{11}$", "$\\frac{1}{2}$"],
    correctAnswer: "$\\frac{4}{11}$"
  },
  {
    question: "Three dice are thrown. Find the probability of getting a total of 15, given that the first die shows 4.",
    options: ["$\\frac{1}{18}$", "$\\frac{1}{12}$", "$\\frac{5}{36}$", "$\\frac{1}{9}$"],
    correctAnswer: "$\\frac{1}{18}$"
  },
  {
    question: "If $A$ and $B$ are two independent events, what is the value of $P(A|A \\cup B)$ when $P(A) = a$ and $P(B) = b$?",
    options: ["$\\frac{a}{a+b-ab}$", "$\\frac{a}{a+b}$", "$\\frac{ab}{a+b-ab}$", "None of these"],
    correctAnswer: "$\\frac{a}{a+b-ab}$"
  },
  {
    question: "If $P(A|B) = \\frac{1}{2}$, $P(B|A) = \\frac{1}{3}$, and $P(A \\cap B) = \\frac{1}{6}$, find $P(A \\cup B)$.",
    options: ["$\\frac{2}{3}$", "$\\frac{1}{2}$", "$\\frac{5}{6}$", "1"],
    correctAnswer: "$\\frac{2}{3}$"
  },
  {
    question: "If $A, B, C$ are three independent events such that $P(A) = a$, $P(B) = b$, $P(C) = c$, then the probability that at least one of them occurs is:",
    options: ["$1 - (1-a)(1-b)(1-c)$", "$a + b + c - abc$", "$abc$", "None of these"],
    correctAnswer: "$1 - (1-a)(1-b)(1-c)$"
  },
  {
    question: "If a fair coin is tossed $n$ times, and the probability of getting at least one head is greater than 0.9, find the minimum value of $n$.",
    options: ["3", "4", "5", "6"],
    correctAnswer: "4"
  },
  {
    question: "If the probability of a defective bolt is 0.1, find the mean and standard deviation of the number of defective bolts in a total of 400 bolts.",
    options: ["40 and 6", "40 and 36", "20 and 6", "None of these"],
    correctAnswer: "40 and 6"
  },
  {
    question: "A box contains 2 gold and 3 silver coins. Another box contains 4 gold and 1 silver coin. A box is chosen at random and a coin is drawn. If the coin is gold, what is the probability that it came from the first box?",
    options: ["$\\frac{1}{3}$", "$\\frac{2}{3}$", "$\\frac{1}{2}$", "$\\frac{1}{4}$"],
    correctAnswer: "$\\frac{1}{3}$"
  },
  {
    question: "In a hurdle race, a runner has probability $p$ of clearing each hurdle. There are 5 hurdles. The runner is out if he fails to clear any hurdle. If the probability that he finishes the race is 0.32768, find $p$.",
    options: ["0.8", "0.7", "0.9", "0.6"],
    correctAnswer: "0.8"
  },
  {
    question: "A factory has two machines A and B. Machine A produces 40% of the items and B produces 60%. 5% of A's items are defective and 10% of B's are defective. If an item is drawn at random, what is the probability that it is defective?",
    options: ["0.08", "0.06", "0.10", "0.05"],
    correctAnswer: "0.08"
  },
  {
    question: "For the same factory in the previous question, if the drawn item is defective, what is the probability that it was produced by machine A?",
    options: ["0.25", "0.75", "0.40", "0.50"],
    correctAnswer: "0.25"
  },
  {
    question: "If 3 cards are drawn from a pack of 52 cards without replacement, find the probability that the first card is a king, the second is a queen, and the third is a jack.",
    options: ["$\\frac{8}{16575}$", "$\\frac{4}{16575}$", "$\\frac{16}{16575}$", "None of these"],
    correctAnswer: "$\\frac{8}{16575}$"
  },
  {
    question: "Let $X$ be a binomial random variable $B(n, p)$. If the mean is 6 and the variance is 2.4, find the value of $p$.",
    options: ["0.6", "0.4", "0.5", "0.3"],
    correctAnswer: "0.6"
  },
  {
    question: "For the same binomial random variable in the previous question, what is the value of the number of trials $n$?",
    options: ["10", "15", "12", "8"],
    correctAnswer: "10"
  },
  {
    question: "If $A$ and $B$ are two independent events, and $P(A) = 0.3$, $P(B) = 0.6$, find $P(A \\cap B')$.",
    options: ["0.12", "0.18", "0.42", "0.28"],
    correctAnswer: "0.12"
  },
  {
    question: "If $A$ and $B$ are two events such that $P(A) = 0.4$, $P(B) = 0.8$, and $P(A \\cup B) = 0.9$, find $P(A'|B)$.",
    options: ["$\\frac{5}{8}$", "$\\frac{3}{8}$", "$\\frac{1}{2}$", "$\\frac{1}{4}$"],
    correctAnswer: "$\\frac{5}{8}$"
  },
  {
    question: "A multiple-choice question has 5 options. If a student guesses, the probability of getting it right is 1/5. If he knows the answer, he gets it right with probability 1. A student knows the answer with probability 0.6. If he answers correctly, what is the probability that he knew the answer?",
    options: ["$\\frac{15}{17}$", "$\\frac{12}{17}$", "$\\frac{3}{5}$", "None of these"],
    correctAnswer: "$\\frac{15}{17}$"
  },
  {
    question: "A random variable $X$ has the probability distribution with $X$ taking values $0, 1, 2$ with probabilities $0.25, 0.5, 0.25$ respectively. Find the expectation $E(X)$.",
    options: ["1", "0.5", "1.5", "2"],
    correctAnswer: "1"
  },
  {
    question: "If a coin is tossed 3 times, let $X$ be the number of heads. Find the variance of $X$.",
    options: ["0.75", "1.50", "0.50", "1.00"],
    correctAnswer: "0.75"
  },
  {
    question: "If $A$ and $B$ are independent events, which of the following expressions is equal to $P(A \\cup B)$?",
    options: ["$1 - P(A')P(B')$", "$P(A)P(B)$", "$1 - P(A)P(B)$", "None of these"],
    correctAnswer: "$1 - P(A')P(B')$"
  },
  {
    question: "An urn contains 4 white and 6 black balls. If 2 balls are drawn at random with replacement, what is the probability that both are white?",
    options: ["$\\frac{4}{25}$", "$\\frac{2}{15}$", "$\\frac{16}{25}$", "None of these"],
    correctAnswer: "$\\frac{4}{25}$"
  },
  {
    question: "If 2 balls are drawn at random without replacement from the same urn (4 white and 6 black), what is the probability that both are white?",
    options: ["$\\frac{2}{15}$", "$\\frac{4}{25}$", "$\\frac{1}{3}$", "None of these"],
    correctAnswer: "$\\frac{2}{15}$"
  },
  {
    question: "If $P(A) = 0.5$ and $P(A \\cup B) = 0.8$, and $A$ and $B$ are independent events, find the probability $P(B)$.",
    options: ["0.6", "0.3", "0.5", "0.4"],
    correctAnswer: "0.6"
  },
  {
    question: "A coin is tossed. If it shows head, a die is thrown. If it shows tail, it is tossed again. Find the probability of getting a 3 on the die, given that the coin shows head initially.",
    options: ["$\\frac{1}{6}$", "$\\frac{1}{2}$", "$\\frac{1}{3}$", "$\\frac{1}{12}$"],
    correctAnswer: "$\\frac{1}{6}$"
  },
  {
    question: "If two independent events $A$ and $B$ have probabilities $P(A) = p$ and $P(B) = 2p - p^2$, find the probability that neither occurs.",
    options: ["$(1-p)^3$", "$(1-p)^2$", "$1-p$", "$(1-p)^4$"],
    correctAnswer: "$(1-p)^3$"
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

  // Find chapter (Probability)
  const chapterDoc = await Chapter.findOne({ classId, normalizedChapterName: 'probability' });
  if (!chapterDoc) {
    console.error('Probability chapter not found for Class 12!');
    process.exit(1);
  }
  const chapterId = chapterDoc._id;

  console.log(`Using classId: ${classId} ("Class 12")`);
  console.log(`Using chapterId: ${chapterId} ("Probability")`);

  let addedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < probabilityQuestions.length; i++) {
    const qData = probabilityQuestions[i];
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
    } catch (err) {
      if (err.code === 11000) {
        duplicateCount++;
      } else {
        console.error(`Error saving Probability question ${i + 1}: ${err.message}`);
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
