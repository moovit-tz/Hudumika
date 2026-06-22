import React from 'react';
import { Card } from 'reactstrap';
import googleLogo from "@/images/icons/campaign/brand/google.png";
import instagramLogo from "@/images/icons/campaign/brand/instagram.png";
import linkedInLogo from "@/images/icons/campaign/brand/linkedin.png";
import slackLogo from "@/images/icons/campaign/brand/slack.png";
import twitterLogo from "@/images/icons/campaign/brand/twitter.png";

const channelData = [
    {
      logo:googleLogo,
      title:'Google',
      subtitle:'SEO & PPC',
      progress: '70%',
      theme:'success',
    },
    {
      logo:instagramLogo,
      title:'Instagram',
      subtitle:'Social Media',
      progress: '86%',
      theme:'primary',
    },
    {
      logo:linkedInLogo,
      title:'Linked In',
      subtitle:'Social Media',
      progress: '75%',
      theme:'danger',
    },
    {
      logo:slackLogo,
      title:'Slack',
      subtitle:'Messanger',
      progress: '64%',
      theme:'info',
    },
    {
      logo:twitterLogo,
      title:'Twitter',
      subtitle:'Social Media',
      progress: '54%',
      theme:'warning',
    }
  ]

const TopChannels = () => {
  return (
    <Card className={`card-full`}>
        <div className="card-inner">
            <div className="card-title-group">
                <div className="card-title">
                    <h6 className="title">Top Channels</h6>
                </div>
                <div className="card-tools">
                    <a href="#" className="link">View All</a>
                </div>
            </div>
        </div>
        <div className="card-inner pt-0">
            <ul className="gy-4">
                {channelData.map((item,index)=>
                    <li key={index} className={`justify-between align-center ${(index < channelData.length - 1) ? 'border-bottom border-0 border-dashed' : ''}`}>
                        <div className="align-center">
                            <div className="user-avatar sq bg-transparent"><img src={item.logo} alt={item.title}/></div>
                            <div className="ms-2">
                                <div className="lead-text">{item.title}</div>
                                <div className="sub-text">{item.subtitle}</div>
                            </div>
                        </div>
                        <div className="align-center">
                            <div className="sub-text me-2">{item.progress}</div>
                            <div className="progress rounded-pill w-80px">
                                <div className={`progress-bar rounded-pill bg-${item.theme}`} style={{width:item.progress}}></div>
                            </div>
                        </div>
                    </li>
                )}
            </ul>
        </div>
    </Card>
  )
}

export default TopChannels