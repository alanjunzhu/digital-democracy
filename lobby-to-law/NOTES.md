# Handover notes

## This lives in the wrong repo, temporarily

The session that generated this could not create a GitHub repository (the app
credential returned 403 on `POST /user/repos`), so it is committed as a subtree
of `digital-democracy` instead. To split it into its own repo:

```bash
# from the digital-democracy checkout, on this branch
git subtree split --prefix=lobby-to-law -b lobby-to-law-only
# create an empty repo on GitHub, then:
git push git@github.com:<you>/lobby-to-law.git lobby-to-law-only:main
```

Or simply `cp -r lobby-to-law /path/to/new-repo && git init`.

## Open questions for the first live run

1. What fraction of DPOH rows name an MP at all, versus staff or a bare role?
   That ratio caps how member-centric the product can be.
2. How many registrations cite a bill number explicitly? If it is small, the
   `citation` join is thin and the timeline needs the weaker category join,
   which changes what can honestly be claimed.
3. What is the real median filing lag? If it is short, the "public found out
   later" angle is weaker than assumed.
4. Do the OCL files use one DPOH row per communication or a delimited list in
   a single cell? The schema assumes one row per official; if it is delimited,
   `ingestCsv` needs a splitter before resolution.
