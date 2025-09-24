import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { stdin as input, stdout as output, stderr as errorStream, exit } from 'node:process';
import { createInterface } from 'node:readline/promises';

interface Question {
  id: string;
  prompt: string;
  description?: string;
  default?: string;
  options?: string[];
}

interface ResponseRecord {
  id: string;
  prompt: string;
  response: string;
}

interface QuestionnaireResult {
  askedAt: string;
  responses: ResponseRecord[];
  answersById: Record<string, string>;
}

interface CliOptions {
  questionsJson?: string;
  questionsFile?: string;
  outputFile?: string;
  helpRequested?: boolean;
}

function printUsage(scriptName: string): void {
  const usage = `Usage: tsx ${scriptName} --questions '<json>' [--output responses.json]\n` +
    `       tsx ${scriptName} --file questions.json [--output responses.json]\n\n` +
    `Most workflows should prefer the npm script:\n` +
    `  npm run ask -- --file questions.json\n` +
    `  npm run ask -- --questions '[{ "id": "goal", "prompt": "What do you need?" }]'\n\n` +
    `Provide the questions as a JSON array. Each entry should include:\n` +
    `  - id (string, required)\n` +
    `  - prompt (string, required)\n` +
    `  - description (string, optional extra context shown before the prompt)\n` +
    `  - default (string, optional default answer)\n` +
    `  - options (string[], optional quick reference list displayed alongside the prompt)\n` +
    `Answers are returned as JSON on stdout. Use --output to save them to a file.`;
  console.log(usage);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case '--questions': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('Missing value for --questions');
        }
        options.questionsJson = value;
        i += 1;
        break;
      }
      case '--file': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('Missing value for --file');
        }
        options.questionsFile = value;
        i += 1;
        break;
      }
      case '--output': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('Missing value for --output');
        }
        options.outputFile = value;
        i += 1;
        break;
      }
      case '--help':
      case '-h':
        options.helpRequested = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function loadQuestions(options: CliOptions): Promise<Question[]> {
  if (options.questionsJson && options.questionsFile) {
    throw new Error('Provide either --questions or --file, not both.');
  }

  if (options.questionsJson) {
    return parseQuestions(options.questionsJson, 'command line');
  }

  if (options.questionsFile) {
    const fileContent = await readFile(options.questionsFile, 'utf8');
    return parseQuestions(fileContent, options.questionsFile);
  }

  throw new Error('No questions provided. Use --questions or --file.');
}

function parseQuestions(rawJson: string, sourceLabel: string): Question[] {
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) {
      throw new Error('Question definition must be an array');
    }

    const questions: Question[] = parsed.map((item, index) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Question at index ${index} is not an object`);
      }

      const { id, prompt, description, default: defaultValue, options } = item as Partial<Question> & {
        default?: string;
      };

      if (typeof id !== 'string' || id.trim() === '') {
        throw new Error(`Question at index ${index} is missing a valid "id"`);
      }

      if (typeof prompt !== 'string' || prompt.trim() === '') {
        throw new Error(`Question at index ${index} is missing a valid "prompt"`);
      }

      if (description !== undefined && typeof description !== 'string') {
        throw new Error(`Question at index ${index} has a non-string "description"`);
      }

      if (defaultValue !== undefined && typeof defaultValue !== 'string') {
        throw new Error(`Question at index ${index} has a non-string "default"`);
      }

      if (options !== undefined) {
        if (!Array.isArray(options) || !options.every((option) => typeof option === 'string')) {
          throw new Error(`Question at index ${index} has an invalid "options" array`);
        }
      }

      return {
        id,
        prompt,
        description,
        default: defaultValue,
        options,
      } satisfies Question;
    });

    ensureUniqueIds(questions, sourceLabel);

    return questions;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Unable to parse questions from ${sourceLabel}: ${error.message}`);
    }
    throw new Error(`Unable to parse questions from ${sourceLabel}: Unknown error`);
  }
}

function ensureUniqueIds(questions: Question[], sourceLabel: string): void {
  const seen = new Set<string>();
  for (const question of questions) {
    if (seen.has(question.id)) {
      throw new Error(`Duplicate question id "${question.id}" in ${sourceLabel}`);
    }
    seen.add(question.id);
  }
}

function formatPrompt(question: Question): string {
  const description = question.description ? `${question.description}\n` : '';
  const optionsText = question.options && question.options.length > 0
    ? ` (${question.options.join('/')})`
    : '';
  const defaultText = question.default !== undefined ? ` [${question.default}]` : '';
  return `${description}${question.prompt}${optionsText}${defaultText ? defaultText : ''}`;
}

async function askQuestions(questions: Question[]): Promise<QuestionnaireResult> {
  const rl = createInterface({ input, output });
  const responses: ResponseRecord[] = [];

  try {
    for (const question of questions) {
      const promptMessage = `${formatPrompt(question)}\n> `;
      const rawAnswer = await rl.question(promptMessage);
      const trimmed = rawAnswer.trim();
      const response = trimmed.length > 0 ? trimmed : question.default ?? '';
      responses.push({ id: question.id, prompt: question.prompt, response });
    }
  } finally {
    await rl.close();
  }

  const answersById = responses.reduce<Record<string, string>>((accumulator, current) => {
    accumulator[current.id] = current.response;
    return accumulator;
  }, {});

  return {
    askedAt: new Date().toISOString(),
    responses,
    answersById,
  };
}

async function persistResult(result: QuestionnaireResult, outputFile?: string): Promise<void> {
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (outputFile) {
    await writeFile(outputFile, json, 'utf8');
    errorStream.write(`Responses saved to ${outputFile}\n`);
  }
  output.write(json);
}

async function main(): Promise<void> {
  const scriptName = basename(process.argv[1] ?? 'question_prompt.ts');
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (cliError) {
    errorStream.write(`${(cliError as Error).message}\n\n`);
    printUsage(scriptName);
    exit(1);
    return;
  }

  if (options.helpRequested) {
    printUsage(scriptName);
    return;
  }

  try {
    const questions = await loadQuestions(options);
    const result = await askQuestions(questions);
    await persistResult(result, options.outputFile);
  } catch (runtimeError) {
    errorStream.write(`Error: ${(runtimeError as Error).message}\n`);
    exit(1);
  }
}

void main();
