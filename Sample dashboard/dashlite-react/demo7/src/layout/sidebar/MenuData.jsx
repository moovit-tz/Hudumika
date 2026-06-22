const menu = [
  {
    heading: "Dashboards",
    icon: "dashboard",
    subMenu: [
      {
        icon: "dashlite",
        text: "Default Dashboard",
        link: "/",
      },
      {
        icon: "bag-fill",
        text: "Ecommerce Dashboard",
        link: "/ecommerce",
      },
      {
        icon: "bitcoin-cash",
        text: "Crypto Dashboard",
        link: "/crypto",
      },
      {
        icon: "bag-fill",
        text: "Sales Dashboard",
        link: "/sales",
      },
      {
        icon: "growth",
        text: "Analytic Dashboard",
        link: "/analytic",
      },
    ],
  },
  {
    heading: "Applications",
    icon: "menu-circled",
    subMenu: [
      {
        text: "Mailbox",
        icon: "inbox-fill",
        link: "/app-inbox",
      },
      {
        text: "Messages",
        icon: "chat-fill",
        link: "/app-messages",
      },
      {
        text: "Chats / Messenger",
        icon: "chat-circle-fill",
        link: "/app-chat",
      },
      {
        text: "Calendar",
        icon: "calender-date-fill",
        link: "/app-calender",
      },
      {
        text: "Kanban",
        icon: "template-fill",
        link: "/app-kanban",
      },
      {
        text: "File Manager",
        icon: "folder",
        link: "/app-file-manager",
        badge: "new"
      },
    ],
  },
  {
    heading: "Pages",
    icon: "files",
    subMenu: [
      {
        icon: "tile-thumb",
        text: "Projects",
        subMenu: [
          {
            text: "Project Cards",
            link: "/project-card",
          },
          {
            text: "Project List",
            link: "/project-list",
          },
        ],
      },
      {
        icon: "users",
        text: "User Manage",
        subMenu: [
          {
            text: "User List - Regular",
            link: "/user-list-regular",
          },
          {
            text: "User List - Compact",
            link: "/user-list-compact",
          },
          {
            text: "User Details - Regular",
            link: "/user-details-regular/1",
          },
          {
            text: "User Profile - Regular",
            link: "/user-profile-regular",
          },
          {
            text: "User Contact - Card",
            link: "/user-contact-card",
          },
        ],
      },
      {
        icon: "file-docs",
        text: "AML / KYCs",
        subMenu: [
          {
            text: "KYC List - Regular",
            link: "/kyc-list-regular",
          },
          {
            text: "KYC Details - Regular",
            link: "/kyc-details-regular/UD01544",
          },
        ],
      },
      {
        icon: "tranx",
        text: "Transaction",
        subMenu: [
          {
            text: "Trans List - Basic",
            link: "/transaction-basic",
          },
          {
            text: "Trans List - Crypto",
            link: "/transaction-crypto",
          },
        ],
      },
      {
        text: "Products",
        icon: "card-view",
        subMenu: [
          {
            text: "Product List",
            link: "/product-list",
          },
          {
            text: "Product Card",
            link: "/product-card",
          },
          {
            text: "Product Details",
            link: "/product-details/0",
          },
        ],
      },
      {
        text: "Invoice",
        icon: "file-docs",
        subMenu: [
          {
            text: "Invoice List",
            link: "/invoice-list",
          },
          {
            text: "Invoice Details",
            link: "/invoice-details/1",
          },
        ],
      },
      {
        text: "Pricing Table",
        icon: "view-col-fill",
        link: "/pricing-table",
      },
      {
        text: "Image Gallery",
        icon: "img-fill",
        link: "/image-gallery",
      },
      {
        text: "Blank / Startup",
        icon: "file-fill",
        link: "/_blank",
      },
      {
        text: "Faqs / Help",
        icon: "file-fill",
        link: "/pages/faq",
      },
      {
        text: "Terms / Policy",
        icon: "file-fill",
        link: "/pages/terms-policy",
      },
      {
        text: "Regular Page - v1",
        icon: "file-fill",
        link: "/pages/regular-v1",
      },
      {
        text: "Regular Page - v2",
        icon: "file-fill",
        link: "/pages/regular-v2",
      },
    ],
  },
  {
    heading: "Misc Pages",
    icon: "server",
    subMenu: [
      {
        text: "Login / Signin",
        link: "/auth-login",
        newTab: true,
      },
      {
        text: "Register / Signup",
        link: "/auth-register",
        newTab: true,
      },
      {
        text: "Forgot Password",
        link: "/auth-reset",
        newTab: true,
      },
      {
        text: "Success / Confirm",
        link: "/auth-success",
        newTab: true,
      },
    ],
  },
  {
    heading: "Error Pages",
    icon: "alert-c",
    subMenu: [
      {
        text: "404 Classic",
        link: "/errors/404-classic",
        newTab: true,
      },
      {
        text: "504 Classic",
        link: "/errors/504-classic",
        newTab: true,
      },
      {
        text: "404 Modern",
        link: "/errors/404-modern",
        newTab: true,
      },
      {
        text: "504 Modern",
        link: "/errors/504-modern",
        newTab: true,
      },
    ],
  },
  {
    heading: "Components",
    icon: "layers",
    subMenu: [
      {
        text: "Ui Elements",
        icon: "layers",
        subMenu: [
          {
            text: "Component List",
            link: "/components",
          },
          {
            text: "Alerts",
            link: "/components/alerts",
          },
          {
            text: "Accordions",
            link: "/components/accordions",
          },
          {
            text: "Avatar",
            link: "/components/avatar",
          },
          {
            text: "Badges",
            link: "/components/badges",
          },
          {
            text: "Buttons",
            link: "/components/buttons",
          },
          {
            text: "Button Group",
            link: "/components/button-group",
          },
          {
            text: "Breadcrumbs",
            link: "/components/breadcrumbs",
          },
          {
            text: "Cards",
            link: "/components/cards",
          },
          {
            text: "Carousel",
            link: "/components/carousel",
          },
          {
            text: "Dropdowns",
            link: "/components/dropdowns",
          },
          {
            text: "Modals",
            link: "/components/modals",
          },
          {
            text: "Pagination",
            link: "/components/pagination",
          },
          {
            text: "Popovers",
            link: "/components/popovers",
          },
          {
            text: "Progress",
            link: "/components/progress",
          },
          {
            text: "Spinner",
            link: "/components/spinner",
          },
          {
            text: "Tabs",
            link: "/components/tabs",
          },
          {
            text: "Toast",
            link: "/components/toast",
          },
          {
            text: "Typography",
            link: "/components/typography",
          },
          {
            text: "Tooltips",
            link: "/components/tooltips",
          },
          {
            text: "Utilities",
            subMenu: [
              {
                text: "Borders",
                link: "/components/util-border",
              },
              {
                text: "Colors",
                link: "/components/util-colors",
              },
              {
                text: "Display",
                link: "/components/util-display",
              },
              {
                text: "Embeded",
                link: "/components/util-embeded",
              },
              {
                text: "Flex",
                link: "/components/util-flex",
              },
              {
                text: "Text",
                link: "/components/util-text",
              },
              {
                text: "Sizing",
                link: "/components/util-sizing",
              },
              {
                text: "Spacing",
                link: "/components/util-spacing",
              },
              {
                text: "Others",
                link: "/components/util-others",
              },
            ],
          },
        ],
      },
      {
        text: "Crafted icons",
        icon: "dot-box-fill",
        subMenu: [
          {
            text: "SVG Icon - Exclusive",
            link: "/svg-icons",
          },
          {
            text: "Nioicon - HandCrafted",
            link: "/nioicon",
          },
        ],
      },
      {
        text: "Tables",
        icon: "table-view-fill",
        subMenu: [
          {
            text: "Basic Tables",
            link: "/table-basic",
          },
          {
            text: "Special Tables",
            link: "/table-special",
          },
          {
            text: "DataTables",
            link: "/table-datatable",
          },
        ],
      },
      {
        text: "Forms",
        icon: "todo-fill",
        subMenu: [
          {
            text: "Form Elements",
            link: "/components/form-elements",
          },
          {
            text: "Checkbox Radio",
            link: "/components/checkbox-radio",
          },
          {
            text: "Advanced Controls",
            link: "/components/advanced-control",
          },
          {
            text: "Input Group",
            link: "/components/input-group",
          },
          {
            text: "Form Upload",
            link: "/components/form-upload",
          },
          {
            text: "Date Time Picker",
            link: "/components/datetime-picker",
          },
          {
            text: "Number Spinner",
            link: "/components/number-spinner",
          },
          {
            text: "noUiSlider",
            link: "/components/nouislider",
          },
          {
            text: "Wizard Basic",
            link: "/components/wizard-basic",
          },
          {
            text: "Rich Editor",
            subMenu: [
              {
                text: "Quill",
                link: "/components/quill",
              },
              {
                text: "Tinymce",
                link: "/components/tinymce",
              },
            ],
          },
        ],
      },
      {
        text: "Charts",
        icon: "pie-fill",
        subMenu: [
          {
            text: "Chart Js",
            link: "/charts/chartjs",
          },
          {
            text: "Knobs",
            link: "/charts/knobs",
          },
        ],
      },
      {
        icon: "puzzle",
        text: "Widgets",
        subMenu: [
          {
            text: "Card Widgets",
            link: "/components/widgets/cards",
          },
          {
            text: "Chart Widgets",
            link: "/components/widgets/charts",
          },
          {
            text: "Rating Widgets",
            link: "/components/widgets/rating",
          },
        ],
      },
      {
        icon: "block-over",
        text: "Miscellaneous",
        subMenu: [
          {
            text: "Slick Sliders",
            link: "/components/misc/slick-slider",
          },
          {
            text: "Tree View",
            link: "/components/misc/tree-view",
          },
          {
            text: "React Toastify",
            link: "/components/misc/toastify",
          },
          {
            text: "Sweet Alert",
            link: "/components/misc/sweet-alert",
          },
          {
            text: "React DualListBox",
            link: "/components/misc/dual-list",
          },
          {
            text: "Dnd Kit",
            link: "/components/misc/dnd",
          },
          {
            text: "Google Map",
            link: "/components/misc/map",
          },
        ],
      },
      {
        text: "Email Template",
        icon: "template-fill",
        link: "/email-template",
      },
    ],
  },
];
export default menu;
