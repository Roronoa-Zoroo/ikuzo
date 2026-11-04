import type { PlopTypes } from "@turbo/gen";

const PACKAGE_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("node-package", {
    actions: [
      {
        path: "{{ turbo.paths.root }}/packages/{{ dashCase name }}/package.json",
        templateFile: "templates/node-package/package.json.hbs",
        type: "add",
      },
      {
        path: "{{ turbo.paths.root }}/packages/{{ dashCase name }}/tsconfig.json",
        templateFile: "templates/node-package/tsconfig.json.hbs",
        type: "add",
      },
      {
        path: "{{ turbo.paths.root }}/packages/{{ dashCase name }}/src/index.ts",
        templateFile: "templates/node-package/src/index.ts.hbs",
        type: "add",
      },
    ],
    description: "Compiled Node.js workspace package under packages/",
    prompts: [
      {
        message: "Package name (without @repo/ prefix)",
        name: "name",
        type: "input",
        validate(input: string) {
          const name = input.trim();
          if (!name) {
            return "Package name is required";
          }
          if (name.startsWith("@")) {
            return "Omit the scope; packages are created as @repo/<name>";
          }
          if (!PACKAGE_NAME_PATTERN.test(name)) {
            return "Use lowercase kebab-case (example: notifications)";
          }
          return true;
        },
      },
    ],
  });
}
