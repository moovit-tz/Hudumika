import React from "react";
import { Link } from "react-router-dom";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import FileManagerAside from "./Aside";
import { useFileManager } from "./Context";
import { Icon, BlockHead, BlockBetween, BlockTitle, BlockHeadContent } from "@/components/Component";

const FileManagerLayout = ({...props}) => {
  const {fileManager} = useFileManager();

  return (
    <>
      <Head title="File Manager"></Head>
      <Content>
      <BlockHead size="md">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>File Manager</BlockTitle>
            </BlockHeadContent>
            <BlockBetween>
              <Link to="" className="back-to">
                <Icon name="arrow-left"></Icon>
                <span>
                  <span className="d-none d-sm-inline-block">Back To </span> Dashboard
                </span>
              </Link>
            </BlockBetween>
          </BlockBetween>
        </BlockHead>
        <div className="nk-fmg">
          <FileManagerAside  />
          <div className="nk-fmg-body" style={{minHeight:`${fileManager.contentHeight}px`}}>
            {props.children}
          </div>
        </div>
      </Content>
    </>
  );
};

export default FileManagerLayout;
