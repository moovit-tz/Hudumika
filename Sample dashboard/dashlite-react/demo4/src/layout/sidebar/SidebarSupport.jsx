import React,{ useEffect,useState } from "react";
import classNames from "classnames";
import SimpleBar from "simplebar-react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "@/components/Component";

import { useTheme, useThemeUpdate } from "@/layout/provider/Theme";
import { Card } from "reactstrap";
import {supportTopics,supportQuestions} from "@/pages/panel/subscription/data/support"

const Sidebar = ({ className }) => {

  const [random, setRandom] = useState();
  const theme = useTheme();
  const themeUpdate = useThemeUpdate();
  const location = useLocation();

  const classes = classNames({
    "nk-aside toggle-screen-lg": true,
    "content-active": theme.sidebarVisibility,
    "mobile-menu": theme.sidebarMobile,
    [`${className}`]: className,
  });

  useEffect(() => {
      const shuffleQuestions = Array(supportQuestions.length).fill(null)
        .map((_, i) => [Math.random(), i])
        .sort(([a], [b]) => a - b)
        .map(([, i]) => supportQuestions[i])
    setRandom(shuffleQuestions);
  }, [location])


  return (
    <>
    <div className={classes}>
      <SimpleBar className="nk-sidebar-menu p-3 p-lg-0">
        <div className="side-wg">
            <Link className="back-to" to={`/subscription/`}><Icon name="home"></Icon><span>Back to Home</span></Link>
        </div>
        <div className="side-wg">
            <div className="side-wg-title">
                <h6 className="overline-title">Categories</h6>
            </div>
            <div className="side-wg-text">
                <ul className="list-plain list-category">
                    {supportTopics.map((item,index)=> 
                      <li key={index}>
                        <Link to={`/subscription/support/${item.slug}`}>{item.title}</Link>
                      </li>
                    )}
                </ul>
            </div>
        </div>
        <div className="side-wg">
            <div className="side-wg-title">
                <h6 className="overline-title">Releated Articles</h6>
            </div>
            <div className="side-wg-text">
                <ul className="list-plain">
                    {random && random.slice(0,4).map((item,index)=>{
                      const topicslug = supportTopics.find((topic) => topic.id === item.topic);
                      return(
                        <li key={index}><Link to={`/subscription/support/${topicslug.slug}/${item.id}`}>{item.title}</Link></li>
                      )
                    })}
                </ul>
            </div>
        </div>
        <div className="side-wg">
            <Card className="card-bordered border-primary">
                <div className="card-inner">
                    <div className="nk-cta-plain">
                        <div className="nk-cta-block">
                            <div className="nk-cta-img">
                                <Icon name="msg" className="icon-circle"></Icon>
                            </div>
                            <div className="nk-cta-text">
                                <p>If you don’t find your question please contact our support team.</p>
                            </div>
                        </div>
                        <div className="nk-cta-action ms-0">
                            <Link to={`/subscription/contact`} className="btn btn-primary">Contact Us</Link>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
      </SimpleBar>
    </div>
    {theme.sidebarVisibility && <div 
      onClick={themeUpdate.sidebarVisibility}
       className="toggle-overlay"></div>}
    </>
  );
};
export default Sidebar;
