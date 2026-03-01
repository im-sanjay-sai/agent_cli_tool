Remove the --force interaction , and remove for all the command and ensure the help also doesn't have it

Ideally report and vt commands should also accept <name> (or both name/id), since nobody memorizes IDs.

add more examples
Not a single --help output includes usage examples. Adding even one example per command would help a lot, e.g.:


Examples:
  $ quill dashboard create --name "Sales Dashboard"
  $ quill query run --sql "SELECT count(*) FROM orders"