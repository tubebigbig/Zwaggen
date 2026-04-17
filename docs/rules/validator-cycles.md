# Validator Cycle Handling

The runtime validator walks user-defined types. Named types can reference each other, including directly or indirectly cyclically (e.g., `TreeNode { children: TreeNode[] }`).

Rules:
- The validator MUST dereference `ref` types by looking up the named type in `spec.types` at validation time, not during schema creation.
- The validator MUST NOT recurse on types alone. Recursion must walk the **value** being validated: each recursive call consumes either a narrower value (array element, object field) or a narrower type (union variant). Since values are finite, the validator terminates.
- Unknown fields on an `object` pass by default; if the object has `strict: true`, unknown fields produce an error at path `fieldname` of kind `unknown-field`.
