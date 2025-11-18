import 'dotenv/config';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import connectDB from './config/db.js';
import User from './models/User.js';
import UserSecurity from './models/UserSecurity.js';
import UserEnrollments from './models/UserEnrollments.js';
import Course from './models/Course.js';
import { BankQuestion } from './models/Question.js';
import Exam from './models/Exam.js';
import Submission from './models/Submission.js';
import SystemLogs from './models/SystemLogs.js';

const importData = async () => {
  try {
    await connectDB();

    // Clear existing data
    await User.deleteMany();
    await UserSecurity.deleteMany();
    await UserEnrollments.deleteMany();
    await Course.deleteMany();
    await BankQuestion.deleteMany();
    await Exam.deleteMany();
    await Submission.deleteMany();
    await SystemLogs.deleteMany();
    console.log('----- Cleared existing data.');

    // --- Create Courses ---
    const courses = await Course.insertMany([
      { code: 'DDT101', name: 'Introduction to Programming' },
      { code: 'DDT202', name: 'Web Application Development' },
      { code: 'DDT303', name: 'Database Systems' },
      { code: 'DDT401', name: 'Software Engineering' },
      { code: 'DDT402', name: 'Data Structures & Algorithms' },
      { code: 'DDT501', name: 'Machine Learning' },
      { code: 'DDT502', name: 'Mobile App Development' },
      { code: 'DDT503', name: 'Cybersecurity Fundamentals' },
    ]);
    console.log('----- Courses Imported!');

    // --- Create Users ---
    const users = [];
    
    // Admin users
    users.push({
      name: 'System Administrator',
      username: 'admin@university.edu',
      password: 'admin123',
      role: 'admin',
      enrolledCourseIds: courses.map(c => c._id),
    });

    // Lecturers (10 lecturers)
    const lecturerNames = [
      'Dr. Ahmad Zulkifli', 'Prof. Siti Nurhaliza', 'Dr. Muhammad Hafiz', 'Prof. Nurul Aina',
      'Dr. Farid Rahman', 'Prof. Aishah Binti Ali', 'Dr. Azman Hashim', 'Prof. Fatimah Zahra',
      'Dr. Razak Ibrahim', 'Prof. Mariam Abdullah'
    ];
    
    lecturerNames.forEach((name, index) => {
      const courseSubset = courses.slice(index % 3, (index % 3) + 3); // Each lecturer teaches 3 courses
      users.push({
        name,
        username: `lecturer${index + 1}@university.edu`,
        password: 'lecturer123',
        role: 'lecturer',
        enrolledCourseIds: courseSubset.map(c => c._id),
      });
    });

    // Students (50 students) - Expanded Malaysian names for uniqueness
    const firstNames = [
      'Ahmad', 'Siti', 'Muhammad', 'Nurul', 'Farid', 'Aishah', 'Azman', 'Fatimah', 'Razak', 'Mariam',
      'Hafiz', 'Zarina', 'Iskandar', 'Nadia', 'Hakim', 'Suraya', 'Danial', 'Aisyah', 'Irfan', 'Sofea',
      'Amir', 'Laila', 'Zaid', 'Hana', 'Iman', 'Yasmin', 'Arif', 'Nora', 'Syafiq', 'Alya',
      'Faris', 'Zara', 'Haris', 'Mira', 'Nazir', 'Lina', 'Kamal', 'Sara', 'Ridhwan', 'Dina',
      'Ashraf', 'Wani', 'Fahmi', 'Rina', 'Zaki', 'Maya', 'Fikri', 'Lia', 'Hariz', 'Yana'
    ];
    const lastNames = [
      'Abdullah', 'Rahman', 'Ibrahim', 'Hassan', 'Ahmad', 'Ismail', 'Omar', 'Ali', 'Yusof', 'Mahmud',
      'Hashim', 'Zakaria', 'Salleh', 'Mansor', 'Razak', 'Hamid', 'Nasir', 'Karim', 'Bakar', 'Daud',
      'Halim', 'Ghani', 'Latif', 'Aziz', 'Talib', 'Zain', 'Noor', 'Shah', 'Khan', 'Rosli',
      'Othman', 'Ramli', 'Yasin', 'Idris', 'Wahab', 'Samad', 'Nordin', 'Sulaiman', 'Harun', 'Jamal',
      'Kassim', 'Mokhtar', 'Sharif', 'Basir', 'Amin', 'Saad', 'Hussin', 'Rashid', 'Faiz', 'Hadi'
    ];
    
    for (let i = 0; i < 50; i++) {
      const firstName = firstNames[i % firstNames.length];
      const lastName = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
      
      users.push({
        name: `${firstName} ${lastName}`,
        username: `student${i + 1}@university.edu`,
        password: 'student123',
        role: 'student',
      });
    }

    const createdUsers = await User.create(users);
    console.log(`----- ${createdUsers.length} Users Imported!`);

    // --- Create UserSecurity records for each user ---
    const userSecurityData = [];
    
    // Admin
    userSecurityData.push({
      userId: createdUsers[0]._id,
      password: 'admin123', // Plain text - will be hashed by UserSecurity model
      isActive: true,
      loginAttempts: 0
    });
    
    // Lecturers
    for (let i = 1; i <= 10; i++) {
      userSecurityData.push({
        userId: createdUsers[i]._id,
        password: 'lecturer123', // Plain text - will be hashed by UserSecurity model
        isActive: true,
        loginAttempts: 0
      });
    }
    
    // Students
    for (let i = 11; i < createdUsers.length; i++) {
      userSecurityData.push({
        userId: createdUsers[i]._id,
        password: 'student123', // Plain text - will be hashed by UserSecurity model
        isActive: true,
        loginAttempts: 0
      });
    }

    const createdUserSecurity = await UserSecurity.create(userSecurityData);
    console.log(`----- ${createdUserSecurity.length} UserSecurity records created!`);

    // --- Create UserEnrollments records ---
    const enrollmentData = [];
    
    // Enroll lecturers in their assigned courses
    const lecturers = createdUsers.filter(user => user.role === 'lecturer');
    lecturers.forEach((lecturer, index) => {
      const courseSubset = courses.slice(index % 3, (index % 3) + 3); // Each lecturer teaches 3 courses
      courseSubset.forEach(course => {
        enrollmentData.push({
          userId: lecturer._id,
          courseId: course._id,
          status: 'active',
          enrolledAt: new Date()
        });
      });
    });
    
    // Enroll students in courses (3-6 courses per student)
    const students = createdUsers.filter(user => user.role === 'student');
    students.forEach(student => {
      const numCourses = Math.floor(Math.random() * 4) + 3; // 3-6 courses
      const selectedCourses = courses.slice(0, numCourses);
      
      selectedCourses.forEach(course => {
        enrollmentData.push({
          userId: student._id,
          courseId: course._id,
          status: 'active',
          enrolledAt: new Date()
        });
      });
    });
    
    const createdEnrollments = await UserEnrollments.create(enrollmentData);
    console.log(`----- ${createdEnrollments.length} UserEnrollments records created!`);

    // --- Create Bank Questions (100+ questions) ---
    const bankQuestionData = [];
    
    // DDT101 - Introduction to Programming (25 questions including essays)
    const progQuestions = [
      { type: 'MCQ', text: 'Which data type is used to store text in Python?', options: ['int', 'str', 'float', 'bool'], answer: 'str', difficulty: 'easy', topic: 'Python Basics', points: 5 },
        { type: 'TF', text: 'A `for` loop is used for iterating over a sequence.', answer: true, difficulty: 'easy', topic: 'Python Basics', points: 5 },
        { type: 'SA', text: 'What keyword is used to define a function in Python?', answer: 'def', difficulty: 'easy', topic: 'Functions', points: 5 },
        { type: 'MCQ', text: 'What is the output of `print(10 // 3)`?', options: ['3.33', '3', '4', '1'], answer: '3', difficulty: 'medium', topic: 'Operators', points: 10 },
        { type: 'MCQ', text: 'Which of the following is NOT a core data type in Python?', options: ['List', 'Dictionary', 'Tuple', 'Class'], answer: 'Class', difficulty: 'medium', topic: 'Data Types', points: 10 },
      { type: 'TF', text: 'Python is a statically-typed language.', answer: false, difficulty: 'medium', topic: 'Python Concepts', points: 10 },
      { type: 'SA', text: 'Which method adds an element to the end of a list?', answer: 'append()', difficulty: 'medium', topic: 'Data Structures', points: 10 },
      { type: 'MCQ', text: 'What does the `pass` statement do?', options: ['Skips the rest of the loop', 'Exits the program', 'Acts as a placeholder', 'Raises an error'], answer: 'Acts as a placeholder', difficulty: 'hard', topic: 'Control Flow', points: 15 },
      { type: 'TF', text: 'A function can return multiple values in Python.', answer: true, difficulty: 'hard', topic: 'Functions', points: 15 },
      { type: 'SA', text: 'What concept allows a subclass to inherit attributes and methods from a superclass?', answer: 'Inheritance', difficulty: 'hard', topic: 'OOP', points: 15 },
      { type: 'MCQ', text: 'What is the correct way to create a list in Python?', options: ['list = []', 'list = ()', 'list = {}', 'list = ""'], answer: 'list = []', difficulty: 'easy', topic: 'Data Structures', points: 5 },
      { type: 'TF', text: 'Python uses indentation to define code blocks.', answer: true, difficulty: 'easy', topic: 'Python Syntax', points: 5 },
      { type: 'SA', text: 'What built-in function returns the length of a sequence?', answer: 'len()', difficulty: 'easy', topic: 'Built-in Functions', points: 5 },
      { type: 'MCQ', text: 'Which operator is used for exponentiation in Python?', options: ['^', '**', 'pow', 'exp'], answer: '**', difficulty: 'medium', topic: 'Operators', points: 10 },
      { type: 'TF', text: 'Lists in Python are mutable.', answer: true, difficulty: 'medium', topic: 'Data Structures', points: 10 },
      { type: 'SA', text: 'What keyword is used to handle exceptions in Python?', answer: 'try', difficulty: 'medium', topic: 'Exception Handling', points: 10 },
      { type: 'MCQ', text: 'What is the output of `bool([])`?', options: ['True', 'False', 'Error', 'None'], answer: 'False', difficulty: 'hard', topic: 'Boolean Logic', points: 15 },
      { type: 'TF', text: 'Global variables can be modified inside a function without the global keyword.', answer: false, difficulty: 'hard', topic: 'Variable Scope', points: 15 },
      { type: 'SA', text: 'What method is used to remove and return the last element from a list?', answer: 'pop()', difficulty: 'hard', topic: 'Data Structures', points: 15 },
      { type: 'MCQ', text: 'Which of these is the correct syntax for a lambda function?', options: ['lambda x: x + 1', 'def lambda x: x + 1', 'lambda(x): x + 1', 'function lambda x: x + 1'], answer: 'lambda x: x + 1', difficulty: 'hard', topic: 'Advanced Functions', points: 15 },
      // Essay Questions
      { type: 'Essay', text: 'Explain the concept of Object-Oriented Programming in Python. Discuss the four main principles (Encapsulation, Inheritance, Polymorphism, and Abstraction) with examples.', answer: 'Sample answer covering OOP principles', difficulty: 'hard', topic: 'OOP Concepts', points: 25 },
      { type: 'Essay', text: 'Compare and contrast lists, tuples, and dictionaries in Python. When would you use each data structure? Provide examples.', answer: 'Sample answer comparing data structures', difficulty: 'medium', topic: 'Data Structures', points: 20 },
      { type: 'Essay', text: 'Describe the importance of exception handling in Python programming. Write a detailed explanation with code examples showing try, except, else, and finally blocks.', answer: 'Sample answer about exception handling', difficulty: 'medium', topic: 'Exception Handling', points: 20 },
      { type: 'Essay', text: 'Explain the concept of recursion in programming. Provide a detailed example of a recursive function and discuss its advantages and disadvantages.', answer: 'Sample answer about recursion', difficulty: 'hard', topic: 'Recursion', points: 25 },
      { type: 'Essay', text: 'Discuss the differences between procedural and object-oriented programming paradigms. What are the benefits of using OOP in software development?', answer: 'Sample answer comparing programming paradigms', difficulty: 'hard', topic: 'Programming Paradigms', points: 25 },
    ];

    // DDT202 - Web Application Development (25 questions including essays)
    const webQuestions = [
      { type: 'MCQ', text: 'What does CSS stand for?', options: ['Cascading Style Sheets', 'Creative Style Sheets', 'Computer Style Sheets', 'Colorful Style Sheets'], answer: 'Cascading Style Sheets', difficulty: 'easy', topic: 'CSS Basics', points: 5 },
      { type: 'TF', text: '`<div>` is an inline element.', answer: false, difficulty: 'easy', topic: 'HTML Basics', points: 5 },
      { type: 'SA', text: 'What HTML tag is used to create a hyperlink?', answer: '<a>', difficulty: 'easy', topic: 'HTML Basics', points: 5 },
      { type: 'MCQ', text: 'Which property is used to change the background color of an element?', options: ['color', 'bgcolor', 'background-color', 'background'], answer: 'background-color', difficulty: 'easy', topic: 'CSS Basics', points: 5 },
      { type: 'TF', text: 'JavaScript can be used to manipulate the DOM.', answer: true, difficulty: 'easy', topic: 'JavaScript Basics', points: 5 },
      { type: 'SA', text: 'What does DOM stand for?', answer: 'Document Object Model', difficulty: 'medium', topic: 'JavaScript Basics', points: 10 },
      { type: 'MCQ', text: 'How do you select an element with id "demo"?', options: ['*demo', '.demo', '#demo', 'demo'], answer: '#demo', difficulty: 'medium', topic: 'CSS Selectors', points: 10 },
      { type: 'MCQ', text: 'What is the correct syntax for referring to an external script called "script.js"?', options: ['<script href="script.js">', '<script src="script.js">', '<script name="script.js">', '<link rel="script" href="script.js">'], answer: '<script src="script.js">', difficulty: 'medium', topic: 'HTML & JS', points: 10 },
      { type: 'TF', text: '`let` and `const` have block scope.', answer: true, difficulty: 'hard', topic: 'Advanced JavaScript', points: 15 },
      { type: 'SA', text: 'Which CSS property makes a flex container\'s items wrap to the next line?', answer: 'flex-wrap', difficulty: 'hard', topic: 'Advanced CSS', points: 15 },
      { type: 'MCQ', text: 'What does HTML stand for?', options: ['Hyper Text Markup Language', 'High Tech Modern Language', 'Hyperlink and Text Markup Language', 'Home Tool Markup Language'], answer: 'Hyper Text Markup Language', difficulty: 'easy', topic: 'HTML Basics', points: 5 },
      { type: 'TF', text: 'The `<title>` tag is placed within the `<body>` of an HTML page.', answer: false, difficulty: 'easy', topic: 'HTML Structure', points: 5 },
      { type: 'SA', text: 'What attribute specifies the URL of the page the link goes to?', answer: 'href', difficulty: 'easy', topic: 'HTML Links', points: 5 },
      { type: 'MCQ', text: 'Which CSS property controls the text size?', options: ['text-style', 'font-size', 'text-size', 'font-style'], answer: 'font-size', difficulty: 'easy', topic: 'CSS Typography', points: 5 },
      { type: 'TF', text: 'CSS Grid is a one-dimensional layout method.', answer: false, difficulty: 'medium', topic: 'CSS Layout', points: 10 },
      { type: 'SA', text: 'What JavaScript method is used to add an event listener?', answer: 'addEventListener()', difficulty: 'medium', topic: 'JavaScript Events', points: 10 },
      { type: 'MCQ', text: 'The `===` operator in JavaScript checks for:', options: ['Value equality only', 'Type equality only', 'Value and type equality', 'Assignment'], answer: 'Value and type equality', difficulty: 'medium', topic: 'JavaScript Operators', points: 10 },
      { type: 'TF', text: 'Arrow functions have their own `this` context.', answer: false, difficulty: 'hard', topic: 'Advanced JavaScript', points: 15 },
      { type: 'SA', text: 'What CSS property is used to create animations?', answer: 'animation', difficulty: 'hard', topic: 'CSS Animations', points: 15 },
      { type: 'MCQ', text: 'Which HTTP method is used to update existing data?', options: ['GET', 'POST', 'PUT', 'DELETE'], answer: 'PUT', difficulty: 'hard', topic: 'HTTP Methods', points: 15 },
      // Essay Questions
      { type: 'Essay', text: 'Explain the concept of responsive web design. Discuss the key principles, techniques, and tools used to create websites that work well on different devices and screen sizes.', answer: 'Sample answer about responsive design', difficulty: 'medium', topic: 'Responsive Design', points: 20 },
      { type: 'Essay', text: 'Compare and contrast client-side and server-side scripting. Provide examples of when each approach is most appropriate and discuss their advantages and disadvantages.', answer: 'Sample answer about client vs server scripting', difficulty: 'hard', topic: 'Web Architecture', points: 25 },
      { type: 'Essay', text: 'Describe the evolution of JavaScript frameworks and libraries. Discuss the benefits of using frameworks like React, Vue, or Angular in modern web development.', answer: 'Sample answer about JS frameworks', difficulty: 'hard', topic: 'JavaScript Frameworks', points: 25 },
      { type: 'Essay', text: 'Explain the importance of web accessibility and discuss the key principles of creating accessible web applications. Provide examples of accessibility features.', answer: 'Sample answer about web accessibility', difficulty: 'medium', topic: 'Web Accessibility', points: 20 },
      { type: 'Essay', text: 'Discuss the security considerations in web application development. What are common vulnerabilities and how can developers protect against them?', answer: 'Sample answer about web security', difficulty: 'hard', topic: 'Web Security', points: 25 },
    ];

    // DDT303 - Database Systems (25 questions including essays)
    const dbQuestions = [
      { type: 'SA', text: 'What is the SQL keyword to retrieve data from a database?', answer: 'SELECT', difficulty: 'easy', topic: 'SQL Basics', points: 5 },
      { type: 'TF', text: 'A primary key can contain NULL values.', answer: false, difficulty: 'easy', topic: 'SQL Basics', points: 5 },
      { type: 'MCQ', text: 'Which command is used to remove a table from the database?', options: ['DELETE TABLE', 'REMOVE TABLE', 'DROP TABLE', 'ERASE TABLE'], answer: 'DROP TABLE', difficulty: 'easy', topic: 'SQL DDL', points: 5 },
      { type: 'MCQ', text: 'Which clause is used to filter results in a SELECT statement?', options: ['FILTER BY', 'LIMIT', 'WHERE', 'HAVING'], answer: 'WHERE', difficulty: 'easy', topic: 'SQL DML', points: 5 },
      { type: 'MCQ', text: 'Which normalization form deals with transitive dependencies?', options: ['1NF', '2NF', '3NF', 'BCNF'], answer: '3NF', difficulty: 'medium', topic: 'Database Normalization', points: 10 },
      { type: 'TF', text: 'A Foreign Key must always refer to a Primary Key in another table.', answer: true, difficulty: 'medium', topic: 'Keys & Constraints', points: 10 },
      { type: 'SA', text: 'What type of JOIN returns all records from the left table, and the matched records from the right table?', answer: 'LEFT JOIN', difficulty: 'medium', topic: 'SQL Joins', points: 10 },
      { type: 'MCQ', text: 'What does ACID stand for in the context of database transactions?', options: ['Atomicity, Consistency, Isolation, Durability', 'Association, Cohesion, Isolation, Durability', 'Atomicity, Concurrency, Integrity, Durability', 'Availability, Consistency, Integrity, Durability'], answer: 'Atomicity, Consistency, Isolation, Durability', difficulty: 'hard', topic: 'Advanced DB Concepts', points: 15 },
      { type: 'SA', text: 'What is the process of creating a non-normalized database from a normalized one to improve performance?', answer: 'Denormalization', difficulty: 'hard', topic: 'Database Optimization', points: 15 },
      { type: 'TF', text: 'An index on a table slows down SELECT queries.', answer: false, difficulty: 'hard', topic: 'Database Optimization', points: 15 },
      { type: 'MCQ', text: 'Which SQL function returns the number of rows in a table?', options: ['COUNT()', 'SUM()', 'TOTAL()', 'ROWS()'], answer: 'COUNT()', difficulty: 'easy', topic: 'SQL Functions', points: 5 },
      { type: 'TF', text: 'The GROUP BY clause must come before the WHERE clause.', answer: false, difficulty: 'easy', topic: 'SQL Syntax', points: 5 },
      { type: 'SA', text: 'What clause is used to sort the result-set in descending order?', answer: 'ORDER BY ... DESC', difficulty: 'medium', topic: 'SQL Sorting', points: 10 },
      { type: 'MCQ', text: 'Which constraint ensures that all values in a column are different?', options: ['PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK'], answer: 'UNIQUE', difficulty: 'medium', topic: 'SQL Constraints', points: 10 },
      { type: 'TF', text: 'The `HAVING` clause can be used without a `GROUP BY` clause.', answer: false, difficulty: 'medium', topic: 'SQL Aggregation', points: 10 },
      { type: 'SA', text: 'What is a unique identifier for a row in a table called?', answer: 'Primary Key', difficulty: 'easy', topic: 'Database Design', points: 5 },
      { type: 'MCQ', text: 'Which normal form eliminates partial dependencies?', options: ['1NF', '2NF', '3NF', 'BCNF'], answer: '2NF', difficulty: 'hard', topic: 'Database Normalization', points: 15 },
      { type: 'TF', text: 'A view in SQL is a virtual table.', answer: true, difficulty: 'medium', topic: 'Database Views', points: 10 },
      { type: 'SA', text: 'What SQL command is used to add new data to a table?', answer: 'INSERT', difficulty: 'easy', topic: 'SQL DML', points: 5 },
      { type: 'MCQ', text: 'Which isolation level prevents dirty reads but allows phantom reads?', options: ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'], answer: 'READ COMMITTED', difficulty: 'hard', topic: 'Transaction Isolation', points: 15 },
      // Essay Questions
      { type: 'Essay', text: 'Explain the concept of database normalization. Discuss the first three normal forms (1NF, 2NF, 3NF) with examples and explain why normalization is important in database design.', answer: 'Sample answer about database normalization', difficulty: 'hard', topic: 'Database Normalization', points: 25 },
      { type: 'Essay', text: 'Compare and contrast SQL and NoSQL databases. Discuss the advantages and disadvantages of each approach and provide examples of when to use each type.', answer: 'Sample answer comparing SQL and NoSQL', difficulty: 'hard', topic: 'Database Types', points: 25 },
      { type: 'Essay', text: 'Describe the ACID properties of database transactions. Explain each property in detail and discuss why they are crucial for maintaining data integrity.', answer: 'Sample answer about ACID properties', difficulty: 'medium', topic: 'Database Transactions', points: 20 },
      { type: 'Essay', text: 'Explain the different types of database relationships (One-to-One, One-to-Many, Many-to-Many). Provide examples and discuss how these relationships are implemented using foreign keys.', answer: 'Sample answer about database relationships', difficulty: 'medium', topic: 'Database Relationships', points: 20 },
      { type: 'Essay', text: 'Discuss database indexing strategies and their impact on query performance. Explain different types of indexes and when to use them for optimization.', answer: 'Sample answer about database indexing', difficulty: 'hard', topic: 'Database Optimization', points: 25 },
    ];

    // Add questions for remaining courses
    const seQuestions = [
      { type: 'MCQ', text: 'What does SDLC stand for?', options: ['Software Development Life Cycle', 'System Design Life Cycle', 'Software Design Life Cycle', 'System Development Life Cycle'], answer: 'Software Development Life Cycle', difficulty: 'easy', topic: 'SDLC', points: 5 },
      { type: 'TF', text: 'Agile methodology emphasizes comprehensive documentation over working software.', answer: false, difficulty: 'medium', topic: 'Agile', points: 10 },
      { type: 'SA', text: 'What design pattern ensures a class has only one instance?', answer: 'Singleton', difficulty: 'hard', topic: 'Design Patterns', points: 15 },
      { type: 'MCQ', text: 'Which UML diagram shows the interaction between objects over time?', options: ['Class Diagram', 'Use Case Diagram', 'Sequence Diagram', 'Activity Diagram'], answer: 'Sequence Diagram', difficulty: 'medium', topic: 'UML', points: 10 },
      { type: 'TF', text: 'Unit testing is performed by end users.', answer: false, difficulty: 'easy', topic: 'Testing', points: 5 },
      // Essay Questions for Software Engineering
      { type: 'Essay', text: 'Compare and contrast Agile and Waterfall software development methodologies. Discuss the advantages and disadvantages of each approach and when each might be most appropriate.', answer: 'Sample answer comparing Agile and Waterfall', difficulty: 'hard', topic: 'SDLC Methodologies', points: 25 },
      { type: 'Essay', text: 'Explain the importance of software testing in the development process. Discuss different types of testing (unit, integration, system, acceptance) and their roles in ensuring software quality.', answer: 'Sample answer about software testing', difficulty: 'medium', topic: 'Software Testing', points: 20 },
    ];

    const dsaQuestions = [
      { type: 'MCQ', text: 'What is the time complexity of binary search?', options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(n²)'], answer: 'O(log n)', difficulty: 'medium', topic: 'Search Algorithms', points: 10 },
      { type: 'TF', text: 'A stack follows the FIFO principle.', answer: false, difficulty: 'easy', topic: 'Data Structures', points: 5 },
      { type: 'SA', text: 'What data structure is used in DFS traversal?', answer: 'Stack', difficulty: 'medium', topic: 'Graph Algorithms', points: 10 },
      { type: 'MCQ', text: 'Which sorting algorithm has the best average case time complexity?', options: ['Bubble Sort', 'Quick Sort', 'Insertion Sort', 'Selection Sort'], answer: 'Quick Sort', difficulty: 'hard', topic: 'Sorting Algorithms', points: 15 },
      { type: 'TF', text: 'A binary tree can have at most 2 children per node.', answer: true, difficulty: 'easy', topic: 'Trees', points: 5 },
    ];

    const mlQuestions = [
      { type: 'MCQ', text: 'What does ML stand for?', options: ['Machine Learning', 'Mathematical Logic', 'Memory Location', 'Multiple Layers'], answer: 'Machine Learning', difficulty: 'easy', topic: 'ML Basics', points: 5 },
      { type: 'TF', text: 'Supervised learning requires labeled training data.', answer: true, difficulty: 'easy', topic: 'Learning Types', points: 5 },
      { type: 'SA', text: 'What algorithm is commonly used for classification problems?', answer: 'Decision Tree', difficulty: 'medium', topic: 'Classification', points: 10 },
      { type: 'MCQ', text: 'Which metric is used to evaluate regression models?', options: ['Accuracy', 'Precision', 'Mean Squared Error', 'F1-Score'], answer: 'Mean Squared Error', difficulty: 'medium', topic: 'Model Evaluation', points: 10 },
      { type: 'TF', text: 'Overfitting occurs when a model performs well on training data but poorly on test data.', answer: true, difficulty: 'hard', topic: 'Model Performance', points: 15 },
    ];

    // Assign questions to courses
    const courseQuestionMap = [
      { course: courses[0], questions: progQuestions }, // DDT101
      { course: courses[1], questions: webQuestions },  // DDT202
      { course: courses[2], questions: dbQuestions },   // DDT303
      { course: courses[3], questions: seQuestions },   // DDT401
      { course: courses[4], questions: dsaQuestions },  // DDT402
      { course: courses[5], questions: mlQuestions },   // DDT501
      { course: courses[6], questions: progQuestions.slice(0, 5) }, // DDT502 (reuse some)
      { course: courses[7], questions: webQuestions.slice(0, 5) },  // DDT503 (reuse some)
    ];

    // Get a lecturer to be the creator of questions
    const lecturer = createdUsers.find(u => u.role === 'lecturer');
    
    courseQuestionMap.forEach(({ course, questions }) => {
      questions.forEach(q => {
        const bankQuestion = {
          courseId: course._id,
          createdBy: lecturer._id,
          question: q.text, // Map 'text' to 'question'
          type: q.type, // Set the question type
          difficulty: q.difficulty,
          points: q.points,
          category: q.topic,
          isActive: true
        };
        
        // Handle different question types
        if (q.type === 'MCQ') {
          bankQuestion.options = q.options;
          bankQuestion.correctAnswer = q.options.indexOf(q.answer); // Convert answer to index
        } else if (q.type === 'TF') {
          bankQuestion.options = ['True', 'False'];
          bankQuestion.correctAnswer = q.answer === true ? 0 : 1;
        } else if (q.type === 'SA' || q.type === 'Essay') {
          bankQuestion.options = [q.answer]; // Store correct answer as single option
          bankQuestion.correctAnswer = 0;
        }
        
        bankQuestionData.push(bankQuestion);
       });
     });

    const bankQuestions = await BankQuestion.insertMany(bankQuestionData);
    console.log(`----- ${bankQuestions.length} Bank Questions Imported!`);

    // --- Create Multiple Exams (20+ exams) ---
    const exams = [];
    const now = new Date();

    courses.forEach((course, courseIndex) => {
      const courseQuestions = bankQuestions.filter(q => q.courseId.equals(course._id));
      
      // Create 3 exams per course
      for (let examIndex = 0; examIndex < 3; examIndex++) {
        let questionSubset;
        
        // For the final exam (examIndex === 2), include essay questions
        if (examIndex === 2) {
          // Get a mix of questions including essays for final exams
          const nonEssayQuestions = courseQuestions.filter(q => q.type !== 'Essay').slice(0, 3);
          const essayQuestions = courseQuestions.filter(q => q.type === 'Essay').slice(0, 2);
          questionSubset = [...nonEssayQuestions, ...essayQuestions];
        } else {
          // Regular exams with first 5 questions (no essays)
          questionSubset = courseQuestions.slice(examIndex * 5, (examIndex + 1) * 5);
        }
        
        const examTypes = ['Quiz', 'Midterm', 'Final'];
        const durations = [30, 60, 90];
        
        let availableFrom, availableUntil;
        
        if (examIndex === 0 || examIndex === 2) { // Past exams (Quiz and Final)
          availableFrom = new Date(now.getTime() - (7 + courseIndex + examIndex) * 24 * 60 * 60 * 1000);
          availableUntil = new Date(now.getTime() - (5 + courseIndex + examIndex) * 24 * 60 * 60 * 1000);
        } else if (examIndex === 1) { // Current exam (Midterm)
          availableFrom = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
          availableUntil = new Date(now.getTime() + (2 + courseIndex) * 24 * 60 * 60 * 1000);
        } else { // Future exam
          availableFrom = new Date(now.getTime() + (3 + courseIndex) * 24 * 60 * 60 * 1000);
          availableUntil = new Date(now.getTime() + (7 + courseIndex) * 24 * 60 * 60 * 1000);
        }

        exams.push({
          title: `${examTypes[examIndex]}: ${course.name}`,
          courseId: course._id,
          durationMinutes: durations[examIndex],
          questionCount: questionSubset.length,
          questions: questionSubset.map(q => ({ ...q.toObject(), id: uuidv4() })),
          availableFrom,
          availableUntil,
        });
      }
    });

    const createdExams = await Exam.insertMany(exams);
    console.log(`----- ${createdExams.length} Exams Imported!`);

    // --- Create Sample Submissions ---
    const studentUsers = createdUsers.filter(u => u.role === 'student');
    const pastExams = createdExams.filter(exam => exam.availableUntil < now);
    
    // Create submissions for past exams
    const submissions = [];
    pastExams.forEach(exam => {
      // Find students enrolled in this exam's course
      const enrolledStudents = studentUsers.filter(student => {
        return createdEnrollments.some(enrollment => 
          enrollment.userId.equals(student._id) && enrollment.courseId.equals(exam.courseId)
        );
      });
      const submissionCount = Math.floor(enrolledStudents.length * (0.3 + Math.random() * 0.5));
      const submittingStudents = enrolledStudents.slice(0, submissionCount);

      submittingStudents.forEach(student => {
        const results = exam.questions.map(question => {
          const isAnswered = Math.random() > 0.1; // 90% chance of answering
          let userAnswer = null;
          let isCorrect = false;

          // Use the actual question type from the question object
          let questionType = question.type || 'SA'; // use the type from the question, default to SA if not present

          // console.log(`Processing question ${question.question || question.text}, isAnswered: ${isAnswered}, type: ${questionType}`);

          if (isAnswered) {
            if (questionType === 'MCQ') {
              // 70% chance of correct answer for MCQ
              if (Math.random() > 0.3) {
                userAnswer = question.correctAnswer; // Store index, not text
                isCorrect = true;
              } else {
                const wrongIndex = Math.floor(Math.random() * question.options.length);
                userAnswer = wrongIndex; // Store index, not text
                isCorrect = wrongIndex === question.correctAnswer;
              }
            } else if (questionType === 'TF') {
              // 75% chance of correct answer for TF
              if (Math.random() > 0.25) {
                userAnswer = question.correctAnswer; // Store index (0 or 1)
                isCorrect = true;
              } else {
                userAnswer = question.correctAnswer === 0 ? 1 : 0; // Store opposite index
                isCorrect = false;
              }
            } else if (questionType === 'SA') {
              // 60% chance of correct answer for SA
              const correctAnswer = question.options ? question.options[question.correctAnswer] : question.correctAnswer;
              if (Math.random() > 0.4) {
                userAnswer = correctAnswer;
                isCorrect = true;
              } else {
                userAnswer = 'incorrect answer';
                isCorrect = false;
              }
            } else if (questionType === 'Essay') {
              // Generate sample essay answers for testing bulk grading
              const sampleAnswers = [
                'This is a comprehensive answer that covers the main concepts. The topic requires understanding of multiple aspects and their interconnections. I believe the key points include several important factors that need to be considered.',
                'In my opinion, this question addresses fundamental principles. The answer involves analyzing different approaches and their implications. There are several methodologies that can be applied to solve this problem effectively.',
                'The question requires a detailed explanation of the concepts involved. Based on my understanding, the main elements include various components that work together. This comprehensive approach ensures better results.',
                'This topic is quite complex and requires careful consideration of multiple factors. The solution involves understanding the underlying principles and applying them appropriately. Different scenarios may require different approaches.',
                'The answer to this question involves several key concepts that are interconnected. Understanding these relationships is crucial for developing effective solutions. The implementation requires careful planning and execution.'
              ];
              userAnswer = sampleAnswers[Math.floor(Math.random() * sampleAnswers.length)];
              isCorrect = false; // essays need manual grading
            }
          }

          // console.log(`Final userAnswer for question: ${userAnswer}, isCorrect: ${isCorrect}`);

          return {
            question: question,
            userAnswer: { questionId: question.id, answer: userAnswer },
            isCorrect,
            pointsAwarded: questionType === 'Essay' ? 0 : (isCorrect ? question.points : 0), // essays start with 0 points, need manual grading
          };
        });

        const totalPointsAwarded = results.reduce((sum, r) => sum + (r.pointsAwarded || 0), 0);
        const totalPointsPossible = exam.questions.reduce((sum, q) => sum + q.points, 0);

        submissions.push({
          examId: exam._id,
          courseId: exam.courseId,
          userId: student._id,
          results,
          totalPointsAwarded,
          totalPointsPossible,
          submittedAt: new Date(exam.availableFrom.getTime() + Math.random() * (exam.availableUntil.getTime() - exam.availableFrom.getTime()))
        });
      });
    });

    await Submission.insertMany(submissions);
    console.log(`----- ${submissions.length} Sample Submissions Imported!`);

    console.log('===== Enhanced Data Imported Successfully! =====');
    console.log(`Summary:
    - ${courses.length} Courses
    - ${createdUsers.length} Users (1 Admin, 10 Lecturers, 50 Students)
    - ${bankQuestions.length} Bank Questions
    - ${createdExams.length} Exams
    - ${submissions.length} Submissions`);
    
    process.exit();
  } catch (error) {
    console.error(`Error with data import: ${error}`);
    process.exit(1);
  }
};

const destroyData = async () => {
  try {
    await connectDB();
    await User.deleteMany();
    await UserSecurity.deleteMany();
    await UserEnrollments.deleteMany();
    await Course.deleteMany();
    await BankQuestion.deleteMany();
    await Exam.deleteMany();
    await Submission.deleteMany();
    await SystemLogs.deleteMany();

    console.log('===== Data Destroyed! =====');
    process.exit();
  } catch (error) {
    console.error(`Error with data destruction: ${error}`);
    process.exit(1);
  }
};

if (process.argv[2] === '-d') {
  destroyData();
} else {
  importData();
}
