export default function ActivityList({
activities
}:{
activities:any[]
}){


return(

<div className="
bg-white
rounded-xl
shadow
">

<h3 className="
font-semibold
p-5
border-b
">
Recent Activity
</h3>


{
activities.map((item,index)=>(

<div
key={index}
className="
p-4
border-b
text-sm
"
>

<b>{item.agent}</b>

{" - "}

{item.action}

<span className="
text-gray-400
ml-2
">
{item.time}
</span>


</div>

))
}


</div>

)

}