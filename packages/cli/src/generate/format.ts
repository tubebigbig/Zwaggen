import prettier from 'prettier';

const CONFIG: prettier.Options = {
  parser: 'typescript',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
};

export async function format(source: string): Promise<string> {
  return prettier.format(source, CONFIG);
}
