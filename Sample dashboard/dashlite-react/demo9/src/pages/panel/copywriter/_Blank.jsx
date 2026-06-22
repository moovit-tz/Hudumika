import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Row } from "@/components/Component";
import { Link } from "react-router-dom";

const Blank = () => {
  return (
    <React.Fragment>
      <Head title="Blank"></Head>
      <Content>
        <BlockHead size="lg">
          <div className="nk-block-head-sub"><span></span></div>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle className="page-title">Blank</BlockTitle>
              <BlockDes>
                
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
      </Content>
    </React.Fragment>
  );
};

export default Blank;
