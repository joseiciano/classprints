# Mockups Critique

This file is to serve as the single source of critiques for current mockups. 

This file will be revised over time but should be treated at the point in time as accurate. 

## Critisms

## Dashboard Page

1. In the assignments card, remove the subtext of each assignment for example change "Fractions worksheet 4 — Equivalent fractions · max 10 · materials verified v2 (2 pages) · created Mar 5" to "Fractions worksheet 4 ‚Äî Equivalent fractions"

2. In the assignments list, we want it to be a table with these columns
Date | Assignment | Status |

That way the format of the list looks like (using markdown here to represent but ti should be translated to code, do not expect the otuput to be 1-1 with the markdown):

```md
Date | Assignment | Status | 
12/7/16 | Fractions Worksheet 4 | (Need Review) | (Click to Open)
```

3. Based on the table shown in point 2, remove the radio buttons (Needs review · 1
Graded · 1
Errors · 1), we just want to track the state (Need Review) if we have non-graded assignments, and (Graded) if all reviewed. 

4. In the assignments card, with the change to the list format, we should have the Date and Assignment and Status cols be sortable. We can click on the column header for them, and it sorts by this (Ascending / Descending)

5. In the assignments card, remove sort · created / updated

6. In the assignments card, we want it paginated. 10 at most in the list. 

7. In the assignments card, we want a search button (currently there is that "Filters & sort") right next to it. When clicked we should refresh the list and show only results relating to the list (either the date, assignment, or status)

8. In the "seating charts" card, remove ClassPrints radio button

9. Add in the Charts page that we are supposed to go to. Keep the one we have in staging if we have one. If not create one. 
