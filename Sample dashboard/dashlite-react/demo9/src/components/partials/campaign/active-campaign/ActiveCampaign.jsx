import React from 'react';
import { Card,Badge } from 'reactstrap';
import avatarE from "@/images/avatar/e-sm.jpg";
import avatarF from "@/images/avatar/f-sm.jpg";
import avatarG from "@/images/avatar/g-sm.jpg";
import avatarH from "@/images/avatar/h-sm.jpg";
import avatarI from "@/images/avatar/i-sm.jpg";
import avatarJ from "@/images/avatar/j-sm.jpg";
import avatarK from "@/images/avatar/k-sm.jpg";

const data = [
    {
        subject:"Happy Christmas",
        created:"01 Dec 22",
        channels:[
            { name:"facebook", icon:"facebook-f" },
            { name:"instagram", icon:"instagram" },
            { name:"linkedin", icon:"linkedin" },
            { name:"twitter", icon:"twitter" },
            { name:"youtube", icon:"youtube-fill" },
        ],
        status:"Live Now",
        assignee:[
            { avatar:avatarE },
            { avatar:avatarF },
            { avatar:avatarG },
            { avatar:avatarH },
            { avatar:avatarI },
        ],
        daterange:"01 Dec - 07 Dec",
    },
    {
        subject:"Black Friday",
        created:"01 Dec 22",
        channels:[
            { name:"linkedin", icon:"linkedin" },
            { name:"facebook", icon:"facebook-f" },
            { name:"instagram", icon:"instagram" },
            { name:"youtube", icon:"youtube-fill" },
        ],
        status:"Live Now",
        assignee:[
            { avatar:avatarH },
            { avatar:avatarI },
            { avatar:avatarJ },
            { avatar:avatarK },
            { avatar:avatarE },
            { avatar:avatarF },
        ],
        daterange:"01 Dec - 07 Dec",
    },
    {
        subject:"Tree Plantation",
        created:"01 Jan 23",
        channels:[
            { name:"twitter", icon:"twitter" },
            { name:"instagram", icon:"instagram" },
            { name:"linkedin", icon:"linkedin" },
        ],
        status:"Paused",
        assignee:[
            { avatar:avatarK },
            { initial:"AE",theme:"pink" },
            { avatar:avatarE },
            { avatar:avatarF },
            { avatar:avatarH },
            { avatar:avatarG },
        ],
        daterange:"01 Jan - 07 Jan",
    },
    {
        subject:"Getaway Trailer",
        created:"12 Dec 22",
        channels:[
            { name:"linkedin", icon:"linkedin" },
            { name:"twitter", icon:"twitter" },
            { name:"facebook", icon:"facebook-f" },
            { name:"youtube", icon:"youtube-fill" },
        ],
        status:"Live Now",
        assignee:[
            { avatar:avatarI },
            { avatar:avatarK },
            { avatar:avatarE },
            { avatar:avatarG },
        ],
        daterange:"12 Dec - 19 Dec",
    },
]

const ActiveCampaign = () => {
  return (
    <Card className="card-full">
        <div className="card-inner">
            <div className="card-title-group">
                <div className="card-title">
                    <h6 className="title">Active Campaign</h6>
                </div>
                <div className="card-tools">
                    <a href="#" className="link">View All</a>
                </div>
            </div>
        </div>
        <div className="card-inner py-0 mt-n2">
            <div className="nk-tb-list nk-tb-flush nk-tb-dashed">
                <div className="nk-tb-item nk-tb-head">
                    <div className="nk-tb-col"><span>Subject</span></div>
                    <div className="nk-tb-col tb-col-mb"><span>Channels</span></div>
                    <div className="nk-tb-col tb-col-sm"><span>Status</span></div>
                    <div className="nk-tb-col tb-col-md"><span>Assignee</span></div>
                    <div className="nk-tb-col text-end"><span>Date Range</span></div>
                </div>
                {data.map((item,index)=>
                    <div key={index} className="nk-tb-item">
                        <div className="nk-tb-col">
                            <span className="tb-lead">{item.subject} <span className={`dot dot-${item.status === "Live Now" ? "success" : item.status === "Paused" ? "warning" : ''} d-sm-none ms-1`}></span></span>
                            <span className="tb-sub">Created on {item.created}</span>
                        </div>
                        <div className="nk-tb-col tb-col-mb">
                            <ul className="d-flex gx-1">
                                {item.channels.map((chanel,index) => <li key={index} className={`text-${chanel.name}`}><em className={`icon ni ni-${chanel.icon}`}></em></li>)}
                            </ul>
                        </div>
                        <div className="nk-tb-col tb-col-sm">
                            <Badge className="badge-dim" color={item.status === "Live Now" ? "success" : item.status === "Paused" ? "warning" : ''}>{item.status}</Badge>
                        </div>
                        <div className="nk-tb-col tb-col-md">
                            <div className="user-avatar-group">
                                {item.assignee.length <= 4 ? item.assignee.slice(0,4).map((assignee,index)=> 
                                    <div key={index} className={`user-avatar xs ${assignee.theme ? `bg-${assignee.theme}` : ""}`}>
                                        {assignee.initial && <span>{assignee.initial}</span>}
                                        {assignee.avatar && <img src={assignee.avatar} alt=""/>}
                                    </div>
                                ) : item.assignee.slice(0,3).map((assignee,index)=> 
                                    <div key={index} className={`user-avatar xs ${assignee.theme ? `bg-${assignee.theme}` : ""}`}>
                                        {assignee.initial && <span>{assignee.initial}</span>}
                                        {assignee.avatar && <img src={assignee.avatar} alt=""/>}
                                    </div>
                                )}
                                {item.assignee.length > 4 && <div className="user-avatar xs">
                                    <span>{item.assignee.length - 3}+</span>
                                </div>}
                            </div>
                        </div>
                        <div className="nk-tb-col text-end"><span>{item.daterange}</span></div>
                    </div>
                )}
            </div>
        </div>
    </Card>
  )
}

export default ActiveCampaign