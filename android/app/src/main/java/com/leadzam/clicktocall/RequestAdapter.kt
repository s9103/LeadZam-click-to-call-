package com.leadzam.clicktocall

import android.text.format.DateUtils
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

/** Shows the received call requests. The list is tiny (max 50) so a full refresh is fine. */
class RequestAdapter(
    private val onCall: (DialRequest) -> Unit,
    private val onDismiss: (DialRequest) -> Unit,
) : RecyclerView.Adapter<RequestAdapter.ViewHolder>() {

    private var items: List<DialRequest> = emptyList()

    @Suppress("NotifyDataSetChanged")
    fun setItems(newItems: List<DialRequest>) {
        items = newItems
        notifyDataSetChanged()
    }

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.tvName)
        val number: TextView = view.findViewById(R.id.tvNumber)
        val statusTime: TextView = view.findViewById(R.id.tvStatusTime)
        val call: Button = view.findViewById(R.id.btnCall)
        val dismiss: Button = view.findViewById(R.id.btnDismiss)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder =
        ViewHolder(LayoutInflater.from(parent.context).inflate(R.layout.item_request, parent, false))

    override fun getItemCount() = items.size

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val request = items[position]
        val context = holder.itemView.context

        val name = request.contactName ?: context.getString(R.string.unknown_contact)
        holder.name.text = name
        holder.number.text = request.phoneNumber

        val status = context.getString(
            when (request.status) {
                RequestStatus.PENDING -> R.string.status_pending
                RequestStatus.DIALER_OPENED -> R.string.status_dialer_opened
                RequestStatus.DISMISSED -> R.string.status_dismissed
            },
        )
        val relative = DateUtils.getRelativeTimeSpanString(
            request.receivedAtMillis, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS,
        )
        holder.statusTime.text = "$status · $relative"

        holder.call.contentDescription = context.getString(R.string.cd_call, name, request.phoneNumber)
        holder.call.setOnClickListener { onCall(request) }
        holder.dismiss.visibility = if (request.status == RequestStatus.PENDING) View.VISIBLE else View.GONE
        holder.dismiss.setOnClickListener { onDismiss(request) }
    }
}
