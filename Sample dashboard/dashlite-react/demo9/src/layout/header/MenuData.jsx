
const headerMenu = [
  {
    text: "Dashboards",
    link:"#",
    active: false,
    subMenu: [
      {
        text: "Default Dashboard",
        link: "/",
      },
      {
        text: "Sales Dashboard",
        link: "/sales",
      },
      {
        text: "Invest Dashboard",
        link: "/invest",
      },
      {
        text: "Crypto Dashboard",
        link: "/crypto",
      },
      {
        text: "Analytics Dashboard",
        link: "/analytics",
      },
    ],
  },
  {
    text: "Apps",
    link:"#",
    active: false,
    subMenu: [
      {
        text: "Messages",
        link: "/app-messages",
      },
      {
        text: "Inbox / Mail",
        link: "/app-inbox",
      },
      {
        text: "File Manager",
        link: "/app-file-manager",
      },
      {
        text: "Chats / Messenger",
        link: "/app-chat",
      },
      {
        text: "Calendar",
        link: "/app-calender",
      },
      {
        text: "Kanban Board",
        link: "/app-kanban",
      },
    ],
  },
  {
    text: "Components",
    link: "/components",
  },
];

const copywriterHeaderMenu = [
  {
    text: "Documents",
    subMenu: [
      {
        text: "Saved",
        link: "/copywriter/document-saved",
      },
      {
        text: "Drafts",
        link: "/copywriter/document-drafts",
      },
    ],
  },
  {
    text: "Editor",
    link: "/copywriter/document-editor",
  },
  {
    text: "Templates",
    link: "/copywriter/templates",
  },
];

export { headerMenu, copywriterHeaderMenu };
