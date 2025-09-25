import type { StorybookConfig } from '@storybook/react-webpack5';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  staticDirs: ['../public'],

  framework: {
    name: '@storybook/react-webpack5',
    options: {},
  },

  webpackFinal: async (config) => {
    config.module?.rules?.push({
      test: /\.tsx?$/,
      exclude: /node_modules/,
      use: [
        {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
      ],
    });

    if (config.resolve) {
      const extensions = config.resolve.extensions ?? [];
      if (!extensions.includes('.ts')) {
        extensions.push('.ts');
      }
      if (!extensions.includes('.tsx')) {
        extensions.push('.tsx');
      }
      config.resolve.extensions = extensions;
    }

    if (config.output) {
      config.output.publicPath = './';
    } else {
      config.output = { publicPath: './' };
    }

    return config;
  }
};

export default config;
