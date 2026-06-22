import React, {useState} from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Row, Icon, Button } from "@/components/Component";
import { Link } from "react-router-dom";
import { history } from "./data/history";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { Card } from "reactstrap";

const History = () => {
  return (
    <React.Fragment>
      <Head title="History"></Head>
      <Content>
        <Block>
          <div className="d-flex flex-wrap align-items-center justify-content-between">
              <h4 className="mb-0">Words Generated</h4>
              <div className="caption-text text-dark">940 <span className="text-base">of 5000 words used.</span></div>
          </div>
          <div className="progress progress-md bg-primary bg-opacity-10 mt-3"> 
              <div className="progress-bar bg-primary" style={{width:"55%"}}></div> 
          </div> 
          <div className="fs-14px text-dark mt-2">To increase your limit, check our <Link to={`/copywriter/pricing-plans`}>Pricing &amp; Plans</Link>.</div>
        </Block>
        <Block>
        <div className="nk-history">
            {history.map((hitem,hindex)=> {
                const itemCount = 2;
                const [showCount,setShowCount] = useState(itemCount);
                return (
                    <React.Fragment key={Math.floor(Math.random()*9999999)}>
                        {hitem.date && 
                            <div key={hindex} className="nk-history-item">
                                <div className="nk-history-symbol">
                                    <div className="nk-history-symbol-dot"></div>
                                </div>
                                <div className="nk-history-content">
                                    <h5>{hitem.date}</h5>
                                </div>
                            </div>
                        }
                        {hitem.variants && hitem.variants.slice(0,showCount).map((vitem,vindex)=>  {
                            return(
                                <div key={vitem.id} className="nk-history-item">
                                    <div className="nk-history-symbol">
                                        <div className={`nk-history-symbol-dot border-${hitem.template.theme}`}></div>
                                    </div>
                                    <div className="nk-history-content">
                                        <VariantCard template={hitem.template} item={vitem} />
                                    </div>
                                </div>
                            )}
                        )}
                        {hitem.variants && hitem.variants.length > itemCount && 
                            <a key={hindex} href="#" onClick={()=> setShowCount(hitem.variants.length !== showCount ? hitem.variants.length : itemCount)} className="nk-history-item nk-history-expand">
                                <div className="nk-history-symbol">
                                    <div className="nk-history-symbol-button">
                                        <Icon name={hitem.variants.length !== showCount ? "unfold-more" : "unfold-less"} />
                                    </div>
                                </div>
                                <div className="nk-history-content">
                                    <h6 className="nk-history-symbol-text">{hitem.variants.length !== showCount ? `Show ${hitem.variants.length - itemCount} more history` : `Hide ${hitem.variants.length - itemCount} history`} </h6>
                                </div>
                            </a>
                        }
                    </React.Fragment>
                )
            }
            )}

        </div>
        </Block>
      </Content>
    </React.Fragment>
  );
};

const VariantCard = ({template,item}) =>{
    const [copyState, setCopyState] = useState(false);
    const onCopyClick = () => {
        setCopyState(true);
        setTimeout(() => setCopyState(false), 2000);
    };
    return(
        <Card>
            <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="d-flex align-items-center">
                        <div className={`user-avatar xs text-${template.theme} bg-${template.theme}-dim`}>
                            <Icon name={template.icon}></Icon>
                        </div>
                        <h5 className="fs-14px fw-normal ms-2">{template.title}</h5>
                    </div>
                    <CopyToClipboard text={item.content} onCopy={onCopyClick}>
                        <Button size="sm" color="blank" className="clipboard-init mx-n2">
                            <span className="clipboard-text align-center"></span>
                            {copyState ? <><Icon name='copy-fill'></Icon><span>Copied</span></> : <><Icon name='copy'></Icon><span>Copy</span></>}
                        </Button>
                    </CopyToClipboard>
                </div>
                <p className="lead text-base">
                    {item.content}
                </p>
                <ul className="nk-history-meta">
                    <li>{item.time}</li>
                    <li>{`${item.content.split(' ').length} Words / ${item.content.trim().length} Characters` }</li>
                </ul>
            </div>
        </Card>
    )
}

export default History;
