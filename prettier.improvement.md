Analyze this NestJS GraphQL code-first project and determine the best Prettier configuration practices based on the actual code style already present in the project.

First, observe the existing code patterns and answer:

1. What is the dominant quote style used? (single or double)
2. Are semicolons consistently used or omitted?
3. What is the typical line length across files?
4. Are trailing commas used? If so, where (objects, arrays, function parameters)?
5. What indentation is used? (spaces or tabs, and how many)
6. How are multi-line objects and arrays formatted?
7. Are arrow function parentheses used for single parameters?
8. How are imports ordered and spaced?

Then, based on your observations: 9. Suggest a complete .prettierrc configuration that matches the existing code style of the project 10. Point out any inconsistencies in formatting across files that Prettier would fix 11. Flag any patterns that might conflict with ESLint rules already in the project 12. Are there any NestJS or GraphQL specific formatting patterns (decorators, resolver signatures, DTOs, entity classes) that need special attention? 13. Should .prettierignore include any specific files or folders in this project? (e.g. generated schema files, migrations, dist)

At the end, provide:

- ✅ A ready-to-use .prettierrc file
- ✅ A ready-to-use .prettierignore file
- 💡 Any recommendations to improve consistency across the codebase before enforcing Prettier in CI

Be specific and reference actual files and patterns found in the project when possible.
