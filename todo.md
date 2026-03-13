# AFTER EVERYTHING IS DONE:

- ADD DOCKER
- ADD GIT LAB
- CREATE AN BIG AND WELL EXPLAINING PROMPT TO CODEX CREATE README.MD FILE - ASKS IF GRAPHQL QUERIES SHOULD BE INSIDE THE FILE

//---//---//---// //---//---//---//
//---//---//---// //---//---//---//
//---//---//---// //---//---//---//

//---//---//---// //---//---//---//

# ANSWER FROM CODEX TO ANALISE:

## SUGGESTED IMPLEMENTATION EXAMPLES:

CHECK IF PEPPER IS WORKING:
What changes:

Old format: plain bcrypt hash, usually starts like $2b$12$...
New format: your code stores a prefix plus bcrypt hash, like bcrypt+hmac-sha256:v1$2b$12$...
So the stored value will be:

longer
different even for the same password
prefixed with bcrypt+hmac-sha256:v1$
How to verify quickly:

Create a new user normally through your GraphQL mutation.
Check the row in the User table.
Inspect the password column.
What you should see:

It should start with bcrypt+hmac-sha256:v1$
It should not be plain text
It should not be only $2b$... anymore for newly created users
Example:

Before pepper: $2b$12$abc...
After pepper: bcrypt+hmac-sha256:v1$$2b$12$abc...
Important detail:

The password is not longer because bcrypt “stores the pepper”.
The extra length comes from your custom prefix bcrypt+hmac-sha256:v1$ added before the bcrypt hash in password.service.ts (line 28).
Best practical tests:

Create two users with the same password.
Their stored hashes should still be different, because bcrypt generates a different salt each time.
Both should start with the pepper prefix.
Login with the correct password should work.
Login with the wrong password should fail.
You can also test legacy migration:

If an existing user has an old hash starting only with $2b$..., log in with the correct password.
After successful login, check the DB again.
That user’s password should now be replaced with the prefixed format.

## RECOMMENDATION FOR YOUR PROJECT:

//---//---//---// //---//---//---//

# NEXT PROMPT (FOR NOT INTERRUPT THE LOGIC IN THE CHAT):

HOW/IF I CAN IMPROVE THIS:
What I see in your project:
repeated preview/user-like shapes:
SafeUser
SafeUserPreview
NotificationActorDTO

//---//---//---// //---//---//---//

# NEXT IDEA:

- CHECK IF ZOD IS VALID FOR MY PROJECT
- BEST PRISMA DATABASE SECURITY MEASURES - IN THE VERSION IM USING
- ADD SOFT DELETE IN PRISMA WHERE IS A GOOD IDEA AND IF ITS NEDDED

//---//---//---// //---//---//---//
