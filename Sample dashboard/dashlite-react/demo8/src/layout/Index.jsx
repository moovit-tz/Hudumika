import React from "react";
import { Outlet } from "react-router-dom";
import menu from "./header/MenuData";
import Head from "./head/Head";
import Header from "./header/Header";
import Footer from "./footer/Footer";
import AppRoot from "./global/AppRoot";
import AppWrap from "./global/AppWrap";

import FileManagerProvider from "@/pages/app/file-manager/components/Context";

const Layout = ({title, ...props}) => {
  return (
    <FileManagerProvider>
      <Head title={!title && 'Loading'} />
      <AppRoot>
          <AppWrap>
            <Header menuData={menu} fixed />
            <Outlet />
            <Footer />
          </AppWrap>
      </AppRoot>
    </FileManagerProvider>
  );
};
export default Layout;
