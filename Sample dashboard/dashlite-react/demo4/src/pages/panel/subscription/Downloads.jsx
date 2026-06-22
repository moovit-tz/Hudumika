import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle,BlockDes, Col, Row } from "@/components/Component";
import { Link } from "react-router-dom";
import { Badge, Card } from "reactstrap";
import { svgData } from "@/pages/components/crafted-icons/NioIconData";

const helpSupportIcon = svgData.filter((icon) => icon.slug === "help-support")[0]

import productPP from "@/images/icons/product-pp.svg";
import productEE from "@/images/icons/product-ee.svg";
import productCC from "@/images/icons/product-cc.svg";
import productSC from "@/images/icons/product-sc.svg";
import productIG from "@/images/icons/product-ig.svg";

const productList = [
  {
    icon:productPP,
    name:'Payment plugin',
    badge:'New',
    version:'1.6.4',
    release:'26 Jan 2020'
  },
  {
    icon:productEE,
    name:'Email Exporter',
    version:'1.3.1',
    release:'15 Dec 2019'
  },
  {
    icon:productCC,
    name:'Cash Cleaner',
    version:'1.7.2',
    release:'05 Feb 2020'
  },
  {
    icon:productSC,
    name:'Spam Checker',
    version:'1.0.3',
    release:'26 Jan 2020'
  },
  {
    icon:productIG,
    name:'Image Gallery',
    version:'1.4.2',
    release:'12 Jan 2020'
  }
]

const Downloads = () => {
  return (
    <React.Fragment>
      <Head title="Downloads"></Head>
      <Content>
        <BlockHead size="lg">
          <div className="nk-block-head-sub"><span>Download</span></div>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">Product Downloads</BlockTitle>
              <BlockDes>
                <p>You can download all the application that available in your plan.</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
        <ul className="sp-pdl-list">
            {productList.map((item,index) => 
              <li key={index} className="sp-pdl-item">
                <div className="sp-pdl-desc">
                    <div className="sp-pdl-img"><img src={item.icon} alt=""/></div>
                    <div className="sp-pdl-info">
                        <h6 className="sp-pdl-title"><span className="sp-pdl-name">{item.name}</span> {item.badge && <Badge color="primary" className="badge-dim rounded-pill">{item.badge}</Badge>}</h6>
                        <div className="sp-pdl-meta">
                            <span className="version">
                                <span className="text-soft">Latest Version: </span> <span>{item.version}</span>
                            </span>
                            <span className="release">
                                <span className="text-soft">Release Date: </span> <span>{item.release}</span>
                            </span>
                        </div>
                    </div>
                </div>
                <div className="sp-pdl-btn">
                    <a href="#" className="btn btn-primary">Download</a>
                </div>
            </li>  
            )}
        </ul>
        </Block>
        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              <div className="nk-help">
                  <div className="nk-help-img">
                      {helpSupportIcon.svg}
                  </div>
                  <div className="nk-help-text">
                      <h5>We’re here to help you!</h5>
                      <p className="text-soft">Ask a question or file a support ticket or report an issues. Our team support team will get back to you by email.</p>
                  </div>
                  <div className="nk-help-action">
                      <Link to={`/subscription/contact`} className="btn btn-lg btn-outline-primary">Get Support Now</Link>
                  </div>
              </div>
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Downloads;
