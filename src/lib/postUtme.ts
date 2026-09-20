/**
 * Post-UTME is a single-university programme.
 *
 * The Post-UTME CBT bank, importer and drill all key off `post_utme_exams.university`.
 * Earlier versions offered a free-text field and a six-university picker
 * (UNILAG / UI / UNN / OAU / ABU / LASU), which let papers be filed under
 * universities the programme does not serve. Everything now reads the value from
 * here so the three surfaces cannot drift apart again.
 *
 * This does NOT affect UTME sign-up, where a student still enters their own
 * desired university — that field is free text in `components/SignUp.tsx` and is
 * deliberately independent of this constant.
 */
export const POST_UTME_UNIVERSITY_CODE = 'UNILORIN';

export const POST_UTME_UNIVERSITY_NAME = 'University of Ilorin';
