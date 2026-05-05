/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Introduction',
    },
    {
      type: 'doc',
      id: 'token-savings',
      label: '💰 Token Savings',
    },
    {
      type: 'doc',
      id: 'installation',
      label: 'Installation',
    },
    {
      type: 'category',
      label: 'Enforcement',
      items: ['hooks', 'securite'],
    },
    {
      type: 'category',
      label: 'Agents & Skills',
      items: ['agents', 'skills'],
    },
    {
      type: 'doc',
      id: 'mode-nuit',
      label: 'Mode Nuit',
    },
    {
      type: 'doc',
      id: 'stacks',
      label: 'Satellites par stack',
    },
    {
      type: 'doc',
      id: 'contribuer',
      label: 'Contribuer',
    },
  ],
};

export default sidebars;
