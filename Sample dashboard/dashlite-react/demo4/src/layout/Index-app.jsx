import React, {useEffect} from "react";
import { Outlet } from "react-router-dom";
import {menu} from "./sidebar/MenuData";
import Sidebar from "./sidebar/Sidebar";
import Head from "./head/Head";
import Header from "./header/Header";
import HeaderSubscription from "./header/HeaderSubscription";
import Footer from "./footer/Footer";
import AppRoot from "./global/AppRoot";
import AppMain from "./global/AppMain";
import AppWrap from "./global/AppWrap";

import { useTheme } from "./provider/Theme";
import FileManagerProvider from "@/pages/app/file-manager/components/Context";

const Layout = ({title, panel, ...props}) => {
  const theme = useTheme();

  useEffect(() => {
    document.body.classList.add("npc-apps","apps-only")
  }, [])

  return (
      <FileManagerProvider>
        <Head title={!title && 'Loading'} />
        <AppRoot>
          <AppMain>
            <AppWrap>
            {panel === 'subscription' ? <HeaderSubscription fixed /> : <Header fixed />}
              <div className="nk-content">
              <div className="container wide-xl">
                <div className="nk-content-inner">
                  <Sidebar  menuData={menu}  />
                  <div className="nk-content-body">
                    <Outlet />
                    <Footer />
                  </div>
                </div>
              </div>
            </div>
            </AppWrap>
          </AppMain>
        </AppRoot>
      </FileManagerProvider>
  );
};
export default Layout;
