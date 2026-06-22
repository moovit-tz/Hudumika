		<!-- Main sidebar -->
		<div class="sidebar sidebar-dark sidebar-main sidebar-expand-lg sidebar-main-resized">

			<!-- Sidebar header -->
			<div class="sidebar-section bg-black bg-opacity-10 border-bottom border-bottom-white border-opacity-10">
				<div class="sidebar-logo d-flex justify-content-center align-items-center">
					<a href="index.html" class="d-inline-flex align-items-center py-2">
						<img src="{{URL::asset('assets/images/logo_icon.svg')}}" class="sidebar-logo-icon" alt="">
						<img src="{{URL::asset('assets/images/logo_text_light.svg')}}" class="sidebar-resize-hide ms-3" height="14" alt="">
					</a>

					<div class="sidebar-resize-hide ms-auto">
						<button type="button" class="btn btn-flat-white btn-icon btn-sm rounded-pill border-transparent sidebar-control sidebar-main-resize d-none d-lg-inline-flex">
							<i class="ph-arrows-left-right"></i>
						</button>

						<button type="button" class="btn btn-flat-white btn-icon btn-sm rounded-pill border-transparent sidebar-mobile-main-toggle d-lg-none">
							<i class="ph-x"></i>
						</button>
					</div>
				</div>
			</div>
			<!-- /sidebar header -->


			<!-- Sidebar content -->
			<div class="sidebar-content">

				<!-- Main navigation -->
				<div class="sidebar-section">
					<ul class="nav nav-sidebar" data-nav-type="accordion">

						<!-- Main -->
						<li class="nav-item-header">
							<div class="text-uppercase fs-sm lh-sm opacity-50 sidebar-resize-hide">Main</div>
							<i class="ph-dots-three sidebar-resize-show"></i>
						</li>
						<li class="nav-item">
							<a href="index" class="nav-link">
								<i class="ph-house"></i>
								<span>Dashboard</span>
							</a>
						</li>

						<!-- Layout -->
						<li class="nav-item-header">
							<div class="text-uppercase fs-sm lh-sm opacity-50 sidebar-resize-hide">Layout</div>
							<i class="ph-dots-three sidebar-resize-show"></i>
						</li>
						<li class="nav-item nav-item-submenu nav-item-expanded nav-item-open">
							<a href="#" class="nav-link">
								<i class="ph-layout"></i>
								<span>Page layouts</span>
							</a>

							<ul class="nav-group-sub collapse show">
								<li class="nav-item"><a href="layout_static.html" class="nav-link">Static layout</a></li>
								<li class="nav-item"><a href="layout_no_header.html" class="nav-link">No header</a></li>
								<li class="nav-item"><a href="layout_no_footer.html" class="nav-link">No footer</a></li>
								<li class="nav-item-divider"></li>
								<li class="nav-item"><a href="layout_fixed_header.html" class="nav-link">Fixed header</a></li>
								<li class="nav-item"><a href="layout_fixed_footer.html" class="nav-link">Fixed footer</a></li>
								<li class="nav-item-divider"></li>
								<li class="nav-item"><a href="layout_2_sidebars_1_side.html" class="nav-link active">2 sidebars on 1 side</a></li>
								<li class="nav-item"><a href="layout_2_sidebars_2_sides.html" class="nav-link">2 sidebars on 2 sides</a></li>
								<li class="nav-item"><a href="layout_3_sidebars.html" class="nav-link">3 sidebars</a></li>
								<li class="nav-item-divider"></li>
								<li class="nav-item"><a href="layout_boxed_page.html" class="nav-link">Boxed page</a></li>
								<li class="nav-item"><a href="layout_boxed_content.html" class="nav-link">Boxed content</a></li>
							</ul>
						</li>
						<li class="nav-item nav-item-submenu">
							<a href="#" class="nav-link"><i class="ph-arrow-elbow-down-right"></i> <span>Menu levels</span></a>
							<ul class="nav-group-sub collapse">
								<li class="nav-item"><a href="#" class="nav-link">Second level</a></li>
								<li class="nav-item nav-item-submenu">
									<a href="#" class="nav-link">Second level with child</a>
									<ul class="nav-group-sub collapse">
										<li class="nav-item"><a href="#" class="nav-link">Third level</a></li>
										<li class="nav-item nav-item-submenu">
											<a href="#" class="nav-link">Third level with child</a>
											<ul class="nav-group-sub collapse">
												<li class="nav-item"><a href="#" class="nav-link">Fourth level</a></li>
												<li class="nav-item"><a href="#" class="nav-link">Fourth level</a></li>
											</ul>
										</li>
										<li class="nav-item"><a href="#" class="nav-link">Third level</a></li>
									</ul>
								</li>
								<li class="nav-item"><a href="#" class="nav-link">Second level</a></li>
							</ul>
						</li>
						<!-- /layout -->

					</ul>
				</div>
				<!-- /main navigation -->

			</div>
			<!-- /sidebar content -->

		</div>
		<!-- /main sidebar -->