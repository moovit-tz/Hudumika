import React, {useEffect} from "react";
import { Outlet } from "react-router-dom";
import Head from "./head/Head";

const Layout = ({title, ...props}) => {
  useEffect(() => {
    setTimeout(() => {
      document.body.classList.remove("has-aside");
    }, 1000);
  }, [])
  return (
    <>
      <Head title={!title && 'Loading'} />
      <div className="nk-app-root">
        <div className="nk-wrap nk-wrap-nosidebar bg-white">
          <div className="nk-content">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
};
export default Layout;
