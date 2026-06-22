import React, {useEffect} from "react";
import { Outlet } from "react-router-dom";
import {componentMenu} from "./sidebar/MenuData";
import Sidebar from "./sidebar/Sidebar";
import Head from "./head/Head";
import Header from "./header/Header";
import Footer from "./footer/Footer";
import AppRoot from "./global/AppRoot";
import AppMain from "./global/AppMain";
import AppWrap from "./global/AppWrap";

const Layout = ({title, ...props}) => {  
  useEffect(() => {
    document.body.classList.add("has-aside");
    document.body.classList.remove("npc-apps","apps-only")
  }, [])
  return (
      <>
        <Head title={!title && 'Loading'} />
        <AppRoot>
          <AppMain>
            <AppWrap>
              <Header fixed />
              <div className="nk-content">
              <div className="container wide-xl">
                <div className="nk-content-inner">
                  <Sidebar menuData={componentMenu} />
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
      </>
  );
};
export default Layout;
